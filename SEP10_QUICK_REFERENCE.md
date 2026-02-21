# SEP-10 Quick Reference

Quick reference for developers working with SEP-10 authentication.

## API Endpoints

### GET /api/sep10/info
Get server information

**Response:**
```json
{
  "authentication_endpoint": "/api/sep10/auth",
  "network_passphrase": "Test SDF Network ; September 2015",
  "signing_key": "GXXXXXX...",
  "version": "1.0.0"
}
```

### POST /api/sep10/auth
Request challenge transaction

**Request:**
```json
{
  "account": "GXXXXXX...",
  "home_domain": "example.com",
  "client_domain": "wallet.example.com",
  "memo": "optional-memo"
}
```

**Response:**
```json
{
  "transaction": "base64-encoded-xdr",
  "network_passphrase": "Test SDF Network ; September 2015"
}
```

### POST /api/sep10/verify
Verify signed challenge

**Request:**
```json
{
  "transaction": "base64-encoded-signed-xdr"
}
```

**Response:**
```json
{
  "token": "session-token",
  "expires_in": 604800
}
```

### POST /api/sep10/logout
Invalidate session

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

## Frontend Usage

### Connect Wallet

```typescript
import { useWallet } from '@/components/lib/wallet-context';

const { connectWallet, isConnected, address } = useWallet();

await connectWallet();
```

### Authenticate

```typescript
const { authenticateWithSep10, isAuthenticated, authToken } = useWallet();

await authenticateWithSep10();
```

### Make Authenticated Request

```typescript
const { authToken } = useWallet();

const response = await fetch('/api/protected', {
  headers: {
    'Authorization': `Bearer ${authToken}`,
  },
});
```

### Logout

```typescript
const { logout } = useWallet();

await logout();
```

## Backend Usage

### Create Service

```rust
use stellar_analytics::auth::sep10_simple::Sep10Service;

let sep10_service = Arc::new(
    Sep10Service::new(
        env::var("SEP10_SERVER_PUBLIC_KEY")?,
        env::var("STELLAR_NETWORK_PASSPHRASE")?,
        env::var("SEP10_HOME_DOMAIN")?,
        redis_connection.clone(),
    )?
);
```

### Add Routes

```rust
use stellar_analytics::api::sep10;

let app = Router::new()
    .merge(sep10::routes(sep10_service.clone()));
```

### Protect Routes

```rust
use axum::middleware;
use stellar_analytics::auth::sep10_middleware::sep10_auth_middleware;

let protected = Router::new()
    .route("/api/protected", get(handler))
    .layer(middleware::from_fn_with_state(
        sep10_service.clone(),
        sep10_auth_middleware
    ));
```

### Access User

```rust
use axum::extract::Extension;
use stellar_analytics::auth::sep10_middleware::Sep10User;

async fn handler(
    Extension(user): Extension<Sep10User>,
) -> String {
    format!("Hello, {}!", user.account)
}
```

## Environment Variables

### Backend (.env)

```bash
SEP10_SERVER_PUBLIC_KEY=GXXXXXX...
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
SEP10_HOME_DOMAIN=localhost
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
```

## Common Patterns

### Full Authentication Flow

```typescript
// 1. Connect wallet
await connectWallet();

// 2. Authenticate
await authenticateWithSep10();

// 3. Make authenticated request
const data = await fetch('/api/data', {
  headers: { 'Authorization': `Bearer ${authToken}` }
});

// 4. Logout when done
await logout();
```

### Error Handling

```typescript
try {
  await authenticateWithSep10();
} catch (error) {
  if (error.message.includes('No compatible wallet')) {
    // Prompt to install wallet
  } else if (error.message.includes('expired')) {
    // Request new challenge
  } else {
    // Generic error handling
  }
}
```

### Session Validation

```rust
// Validate session
let session = sep10_service.validate_session(&token).await?;

// Check if expired
if session.expires_at < Utc::now().timestamp() {
    return Err(anyhow!("Session expired"));
}
```

## Wallet Integration

### Freighter

```typescript
if (window.freighter) {
  const publicKey = await window.freighter.getPublicKey();
  const signedXdr = await window.freighter.signTransaction(xdr, {
    network: networkPassphrase,
    accountToSign: publicKey,
  });
}
```

### Albedo

```typescript
if (window.albedo) {
  const result = await window.albedo.publicKey({});
  const publicKey = result.pubkey;
  
  const signed = await window.albedo.tx({
    xdr: challengeXdr,
    network: networkPassphrase,
  });
}
```

### xBull

```typescript
if (window.xBullSDK) {
  const result = await window.xBullSDK.signTransaction({
    xdr: challengeXdr,
    network: networkPassphrase,
    publicKey: publicKey,
  });
}
```

### Rabet

```typescript
if (window.rabet) {
  const result = await window.rabet.connect();
  const publicKey = result.publicKey;
  
  const signed = await window.rabet.sign(challengeXdr, networkPassphrase);
}
```

## Testing

### Backend Tests

```bash
# Run all SEP-10 tests
cargo test sep10

# Run specific test
cargo test test_generate_challenge

# Run with output
cargo test sep10 -- --nocapture
```

### Frontend Tests

```bash
# Run all tests
npm test

# Run SEP-10 tests
npm test sep10Auth

# Run with coverage
npm test -- --coverage
```

### Manual Testing

```bash
# 1. Start Redis
redis-server

# 2. Start backend
cd backend && cargo run

# 3. Start frontend
cd frontend && npm run dev

# 4. Visit demo
open http://localhost:3000/sep10-demo
```

## Debugging

### Check Redis

```bash
# Connect to Redis
redis-cli

# List all keys
KEYS sep10:*

# Get challenge
GET sep10:challenge:GXXXXXX:nonce

# Get session
GET sep10:session:token

# Monitor operations
MONITOR
```

### Backend Logs

```bash
# Enable debug logging
RUST_LOG=debug cargo run

# Filter SEP-10 logs
RUST_LOG=stellar_analytics::auth::sep10=debug cargo run
```

### Frontend Logs

```typescript
// Enable verbose logging
localStorage.setItem('debug', 'sep10:*');

// Check wallet detection
console.log('Freighter:', !!window.freighter);
console.log('Albedo:', !!window.albedo);
```

## Common Issues

### "No compatible wallet found"
- Install a Stellar wallet extension
- Ensure wallet is unlocked
- Refresh page after installation

### "Challenge expired"
- Challenges valid for 5 minutes
- Sign promptly after requesting
- Request new challenge if expired

### "Invalid signature"
- Ensure correct account is signing
- Check network passphrase matches
- Verify wallet is on correct network

### "Session not found"
- Token may have expired (7 days)
- Re-authenticate to get new token
- Check Redis is running

### "Redis connection failed"
- Start Redis: `redis-server`
- Check REDIS_URL in .env
- Verify Redis is accessible

## Performance Tips

- Cache server info response
- Reuse sessions across requests
- Implement session refresh
- Use connection pooling for Redis
- Enable Redis persistence

## Security Best Practices

- Always use HTTPS in production
- Validate all inputs
- Implement rate limiting
- Monitor authentication patterns
- Regular security audits
- Keep dependencies updated
- Use secure session storage

## Constants

```rust
// Challenge expiry: 5 minutes
const CHALLENGE_EXPIRY_SECONDS: i64 = 300;

// Session expiry: 7 days
const SESSION_EXPIRY_DAYS: i64 = 7;

// Min time bounds: 5 minutes
const MIN_TIME_BOUNDS: i64 = 300;

// Max time bounds: 15 minutes
const MAX_TIME_BOUNDS: i64 = 900;
```

## Network Passphrases

```bash
# Testnet
"Test SDF Network ; September 2015"

# Mainnet
"Public Global Stellar Network ; September 2015"
```

## File Locations

### Backend
- Service: `backend/src/auth/sep10_simple.rs`
- API: `backend/src/api/sep10.rs`
- Middleware: `backend/src/auth/sep10_middleware.rs`
- Tests: `backend/tests/sep10_test.rs`

### Frontend
- Service: `frontend/src/services/sep10Auth.ts`
- Context: `frontend/src/components/lib/wallet-context.tsx`
- Button: `frontend/src/components/wallet-connect.tsx`
- Demo: `frontend/src/app/sep10-demo/page.tsx`
- Tests: `frontend/src/services/__tests__/sep10Auth.test.ts`

## Resources

- [Setup Guide](SEP10_SETUP.md)
- [Full Documentation](backend/SEP10_AUTHENTICATION.md)
- [Migration Guide](SEP10_MIGRATION_GUIDE.md)
- [Checklist](SEP10_CHECKLIST.md)
- [SEP-10 Spec](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md)

## Support

For issues or questions:
1. Check troubleshooting section
2. Review documentation
3. Test with demo page
4. Check Redis logs
5. Verify wallet installation
