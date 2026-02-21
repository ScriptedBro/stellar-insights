# SEP-10 Migration Guide

Guide for migrating from password-based authentication to SEP-10 Stellar Web Authentication.

## Overview

This guide helps you migrate your application from traditional password-based authentication to SEP-10 while maintaining backward compatibility.

## Migration Strategy

### Phase 1: Parallel Authentication (Recommended)

Run both authentication systems side-by-side:

```
┌─────────────────────────────────────┐
│         Your Application            │
├─────────────────────────────────────┤
│  Password Auth    │    SEP-10 Auth  │
│  /api/auth/*      │    /api/sep10/* │
│  (existing)       │    (new)        │
└─────────────────────────────────────┘
```

**Benefits:**
- Zero downtime
- Users can choose authentication method
- Gradual migration
- Easy rollback

### Phase 2: Gradual Route Migration

Migrate routes one at a time:

```rust
// Old route (password auth)
let old_route = Router::new()
    .route("/api/old-endpoint", get(handler))
    .layer(middleware::from_fn(auth_middleware));

// New route (SEP-10 auth)
let new_route = Router::new()
    .route("/api/new-endpoint", get(handler))
    .layer(middleware::from_fn_with_state(
        sep10_service.clone(),
        sep10_auth_middleware
    ));
```

### Phase 3: Complete Migration

Once all users have migrated, remove password authentication.

## Backend Migration

### Step 1: Add SEP-10 Alongside Existing Auth

Keep your existing auth code and add SEP-10:

```rust
// main.rs
use stellar_analytics::auth::{AuthService, sep10::Sep10Service};

// Existing auth service
let auth_service = Arc::new(AuthService::new(redis_connection.clone()));

// New SEP-10 service
let sep10_service = Arc::new(
    Sep10Service::new(
        &env::var("SEP10_SERVER_SECRET").expect("SEP10_SERVER_SECRET must be set"),
        env::var("STELLAR_NETWORK_PASSPHRASE")
            .unwrap_or_else(|_| "Test SDF Network ; September 2015".to_string()),
        env::var("SEP10_HOME_DOMAIN").unwrap_or_else(|_| "localhost".to_string()),
        redis_connection.clone(),
    )
    .expect("Failed to create SEP-10 service"),
);

// Both route sets
let app = Router::new()
    .merge(auth::routes(auth_service))      // Existing
    .merge(sep10::routes(sep10_service))    // New
    // ... other routes
```

### Step 2: Create Dual-Auth Middleware

Support both authentication methods on the same route:

```rust
// dual_auth_middleware.rs
use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
};

pub async fn dual_auth_middleware(
    State((auth_service, sep10_service)): State<(Arc<AuthService>, Arc<Sep10Service>)>,
    mut req: Request,
    next: Next,
) -> Result<Response, AuthError> {
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or(AuthError::MissingToken)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(AuthError::InvalidToken)?;

    // Try SEP-10 first
    if let Ok(session) = sep10_service.validate_session(token).await {
        let sep10_user = Sep10User {
            account: session.account,
            client_domain: session.client_domain,
        };
        req.extensions_mut().insert(sep10_user);
        return Ok(next.run(req).await);
    }

    // Fall back to password auth
    if let Ok(claims) = auth_service.validate_token(token) {
        let auth_user = AuthUser {
            user_id: claims.sub,
            username: claims.username,
        };
        req.extensions_mut().insert(auth_user);
        return Ok(next.run(req).await);
    }

    Err(AuthError::InvalidToken)
}
```

### Step 3: Link Accounts

Create a mapping between Stellar accounts and existing user accounts:

```sql
-- Migration: Link Stellar accounts to existing users
CREATE TABLE user_stellar_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    stellar_account TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_user_stellar_accounts_user_id ON user_stellar_accounts(user_id);
CREATE INDEX idx_user_stellar_accounts_stellar_account ON user_stellar_accounts(stellar_account);
```

```rust
// Link Stellar account to existing user
pub async fn link_stellar_account(
    pool: &SqlitePool,
    user_id: &str,
    stellar_account: &str,
) -> Result<()> {
    sqlx::query!(
        "INSERT INTO user_stellar_accounts (user_id, stellar_account, created_at)
         VALUES (?, ?, ?)",
        user_id,
        stellar_account,
        Utc::now().timestamp()
    )
    .execute(pool)
    .await?;

    Ok(())
}
```

### Step 4: Unified User Extraction

Create a unified way to get user info from either auth method:

```rust
#[derive(Debug, Clone)]
pub enum AuthenticatedUser {
    Password { user_id: String, username: String },
    Sep10 { account: String, client_domain: Option<String> },
}

impl AuthenticatedUser {
    pub fn identifier(&self) -> String {
        match self {
            AuthenticatedUser::Password { user_id, .. } => user_id.clone(),
            AuthenticatedUser::Sep10 { account, .. } => account.clone(),
        }
    }
}

// Extract from request
pub fn extract_user(req: &Request) -> Option<AuthenticatedUser> {
    if let Some(sep10_user) = req.extensions().get::<Sep10User>() {
        return Some(AuthenticatedUser::Sep10 {
            account: sep10_user.account.clone(),
            client_domain: sep10_user.client_domain.clone(),
        });
    }

    if let Some(auth_user) = req.extensions().get::<AuthUser>() {
        return Some(AuthenticatedUser::Password {
            user_id: auth_user.user_id.clone(),
            username: auth_user.username.clone(),
        });
    }

    None
}
```

## Frontend Migration

### Step 1: Add SEP-10 to Existing Auth Context

Extend your existing auth context:

```tsx
interface AuthContextType {
  // Existing password auth
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  
  // New SEP-10 auth
  isWalletConnected: boolean;
  walletAddress: string | null;
  isSep10Authenticated: boolean;
  sep10Token: string | null;
  connectWallet: () => Promise<void>;
  authenticateWithSep10: () => Promise<void>;
  logoutSep10: () => Promise<void>;
}
```

### Step 2: Unified Auth Provider

```tsx
export function UnifiedAuthProvider({ children }) {
  // Password auth state
  const [user, setUser] = useState<User | null>(null);
  const [passwordToken, setPasswordToken] = useState<string | null>(null);
  
  // SEP-10 auth state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [sep10Token, setSep10Token] = useState<string | null>(null);
  
  // Determine which auth method is active
  const isAuthenticated = !!user || !!sep10Token;
  const authToken = sep10Token || passwordToken;
  
  // ... implementation
  
  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      authToken,
      // ... all methods
    }}>
      {children}
    </AuthContext.Provider>
  );
}
```

### Step 3: Dual Login UI

Provide both login options:

```tsx
function LoginPage() {
  const { login, connectWallet, authenticateWithSep10 } = useAuth();
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);

  return (
    <div>
      <h1>Login</h1>
      
      {/* SEP-10 Login (Primary) */}
      <div>
        <h2>Login with Stellar Wallet</h2>
        <button onClick={async () => {
          await connectWallet();
          await authenticateWithSep10();
        }}>
          Connect Wallet & Authenticate
        </button>
      </div>
      
      {/* Password Login (Fallback) */}
      <div>
        <button onClick={() => setShowPasswordLogin(!showPasswordLogin)}>
          Or use password login
        </button>
        
        {showPasswordLogin && (
          <form onSubmit={handlePasswordLogin}>
            <input type="text" name="username" />
            <input type="password" name="password" />
            <button type="submit">Login</button>
          </form>
        )}
      </div>
    </div>
  );
}
```

### Step 4: Account Linking UI

Allow users to link their Stellar account to existing account:

```tsx
function AccountSettings() {
  const { user, walletAddress, linkStellarAccount } = useAuth();

  const handleLinkAccount = async () => {
    if (!walletAddress) {
      await connectWallet();
    }
    
    await linkStellarAccount();
    alert('Stellar account linked successfully!');
  };

  return (
    <div>
      <h2>Account Settings</h2>
      
      {user && !user.stellar_account && (
        <div>
          <p>Link your Stellar wallet for password-free login</p>
          <button onClick={handleLinkAccount}>
            Link Stellar Account
          </button>
        </div>
      )}
      
      {user?.stellar_account && (
        <div>
          <p>Linked Stellar Account: {user.stellar_account}</p>
          <p>You can now login with your wallet!</p>
        </div>
      )}
    </div>
  );
}
```

## Migration Timeline

### Week 1-2: Setup & Testing

- [ ] Deploy SEP-10 implementation
- [ ] Test in staging environment
- [ ] Verify both auth methods work
- [ ] Test account linking

### Week 3-4: Soft Launch

- [ ] Enable SEP-10 for beta users
- [ ] Monitor error rates
- [ ] Gather user feedback
- [ ] Fix any issues

### Week 5-6: Full Rollout

- [ ] Enable SEP-10 for all users
- [ ] Promote wallet authentication
- [ ] Provide migration guides
- [ ] Support users during transition

### Week 7-8: Optimization

- [ ] Analyze adoption metrics
- [ ] Optimize user experience
- [ ] Address edge cases
- [ ] Improve documentation

### Month 3+: Deprecation Planning

- [ ] Set password auth deprecation date
- [ ] Notify remaining password users
- [ ] Provide migration assistance
- [ ] Plan final cutover

## User Communication

### Announcement Email Template

```
Subject: New Login Method: Authenticate with Your Stellar Wallet

Hi [User],

We're excited to announce a new, more secure way to login to [Your App]!

You can now authenticate using your Stellar wallet - no password required!

Benefits:
✓ More secure - uses cryptographic signatures
✓ Faster login - one click authentication
✓ No passwords to remember
✓ Works with Freighter, Albedo, xBull, and Rabet wallets

Your existing password login still works, but we encourage you to try the new method.

Get Started:
1. Install a Stellar wallet (we recommend Freighter)
2. Visit [Your App] and click "Connect Wallet"
3. Link your wallet to your account

Questions? Check our FAQ: [link]

Thanks,
The [Your App] Team
```

### In-App Banner

```tsx
function MigrationBanner() {
  const { user, hasStellarAccount } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || hasStellarAccount) return null;

  return (
    <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold">New: Login with Your Stellar Wallet!</h3>
          <p>More secure, no password required.</p>
          <a href="/link-wallet" className="text-blue-600 underline">
            Link your wallet now →
          </a>
        </div>
        <button onClick={() => setDismissed(true)}>×</button>
      </div>
    </div>
  );
}
```

## Rollback Plan

If issues arise, you can quickly rollback:

### Backend Rollback

```rust
// Disable SEP-10 routes
let app = Router::new()
    .merge(auth::routes(auth_service))      // Keep
    // .merge(sep10::routes(sep10_service)) // Comment out
    // ... other routes
```

### Frontend Rollback

```tsx
// Disable SEP-10 UI
const ENABLE_SEP10 = false; // Feature flag

function LoginPage() {
  return (
    <div>
      {ENABLE_SEP10 && <WalletLoginButton />}
      <PasswordLoginForm />
    </div>
  );
}
```

## Monitoring & Metrics

Track these metrics during migration:

```typescript
// Analytics events
analytics.track('sep10_auth_started');
analytics.track('sep10_auth_completed');
analytics.track('sep10_auth_failed', { error: errorMessage });
analytics.track('account_linked', { method: 'stellar' });
```

Key metrics:
- SEP-10 adoption rate
- Authentication success rate
- Average authentication time
- Error rates by type
- User satisfaction scores

## FAQ

**Q: Can users have both password and SEP-10 auth?**
A: Yes! During migration, users can use either method.

**Q: What happens to existing sessions?**
A: Existing password sessions remain valid. Users can continue using them.

**Q: Can users switch between auth methods?**
A: Yes, users can login with either method at any time.

**Q: How do we handle password resets during migration?**
A: Keep password reset functionality until full migration is complete.

**Q: What if a user loses access to their wallet?**
A: Keep password auth as a backup recovery method during migration.

## Support Resources

- [SEP-10 Setup Guide](SEP10_SETUP.md)
- [Full Documentation](backend/SEP10_AUTHENTICATION.md)
- [Stellar Developer Docs](https://developers.stellar.org)
- [SEP-10 Specification](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md)

## Conclusion

Migrating to SEP-10 provides better security and user experience. By following this phased approach, you can migrate smoothly while maintaining service continuity.

Remember:
- Start with parallel authentication
- Migrate gradually
- Monitor closely
- Support users throughout
- Keep rollback options ready
