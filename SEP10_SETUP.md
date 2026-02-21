# SEP-10 Authentication Setup Guide

Quick setup guide for implementing SEP-10 Stellar Web Authentication in your application.

## Prerequisites

- Rust 1.70+ (for backend)
- Node.js 18+ (for frontend)
- Redis server running
- Stellar wallet (Freighter, Albedo, xBull, or Rabet)

## Backend Setup

### 1. Install Dependencies

The required dependencies are already in `backend/Cargo.toml`:

```toml
stellar-base = "0.1"
stellar-xdr = { version = "21.0.0", features = ["std", "curr"] }
redis = { version = "0.25", features = ["aio", "tokio-comp"] }
base64 = "0.22"
```

Build the project:

```bash
cd backend
cargo build
```

### 2. Configure Environment Variables

Create or update `backend/.env`:

```bash
# SEP-10 Configuration
SEP10_SERVER_SECRET=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
SEP10_HOME_DOMAIN=localhost

# For production, use:
# STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
# SEP10_HOME_DOMAIN=yourdomain.com

# Redis Configuration
REDIS_URL=redis://localhost:6379

# JWT Secret (for existing auth compatibility)
JWT_SECRET=your-secret-key-change-in-production
```

### 3. Generate Server Keypair

Generate a new Stellar keypair for your server:

```bash
# Using Stellar CLI
stellar keys generate server --network testnet

# Or use any Stellar keypair generator
# Save the secret key to SEP10_SERVER_SECRET
```

### 4. Update Main Application

Add SEP-10 service and routes to your main application (`backend/src/main.rs`):

```rust
use stellar_analytics::auth::sep10::Sep10Service;
use stellar_analytics::api::sep10;

// In your main function:
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

// Add SEP-10 routes
let app = Router::new()
    .merge(sep10::routes(sep10_service.clone()))
    // ... other routes
```

### 5. Protect Routes (Optional)

To protect routes with SEP-10 authentication:

```rust
use axum::middleware;
use stellar_analytics::auth::sep10_middleware::sep10_auth_middleware;

let protected_routes = Router::new()
    .route("/api/protected", get(protected_handler))
    .layer(middleware::from_fn_with_state(
        sep10_service.clone(),
        sep10_auth_middleware
    ));
```

### 6. Run Tests

```bash
cd backend
cargo test sep10
```

## Frontend Setup

### 1. Install Dependencies

The Stellar SDK is already in `frontend/package.json`:

```json
{
  "dependencies": {
    "@stellar/stellar-sdk": "^14.5.0"
  }
}
```

Install dependencies:

```bash
cd frontend
npm install
```

### 2. Configure Environment Variables

Create or update `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### 3. Add Wallet Provider

Ensure the `WalletProvider` is wrapping your app in `frontend/src/app/layout.tsx`:

```tsx
import { WalletProvider } from '@/components/lib/wallet-context';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
```

### 4. Use SEP-10 Authentication

In any component:

```tsx
import { useWallet } from '@/components/lib/wallet-context';

function MyComponent() {
  const {
    isConnected,
    isAuthenticated,
    authToken,
    connectWallet,
    authenticateWithSep10,
    logout,
  } = useWallet();

  return (
    <div>
      {!isConnected && (
        <button onClick={connectWallet}>Connect Wallet</button>
      )}
      
      {isConnected && !isAuthenticated && (
        <button onClick={authenticateWithSep10}>Authenticate</button>
      )}
      
      {isAuthenticated && (
        <>
          <p>Authenticated!</p>
          <button onClick={logout}>Logout</button>
        </>
      )}
    </div>
  );
}
```

### 5. Make Authenticated Requests

```tsx
const { authToken } = useWallet();

const fetchProtectedData = async () => {
  const response = await fetch('/api/protected', {
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  });
  
  const data = await response.json();
  return data;
};
```

### 6. Run Tests

```bash
cd frontend
npm test
```

## Testing the Implementation

### 1. Start Redis

```bash
redis-server
```

### 2. Start Backend

```bash
cd backend
cargo run
```

Backend should be running on `http://localhost:8080`

### 3. Start Frontend

```bash
cd frontend
npm run dev
```

Frontend should be running on `http://localhost:3000`

### 4. Test SEP-10 Flow

1. Visit `http://localhost:3000/sep10-demo`
2. Click "Connect Wallet"
3. Approve wallet connection in your Stellar wallet
4. Click "Authenticate with SEP-10"
5. Sign the challenge transaction in your wallet
6. You should now be authenticated!

### 5. Verify API Endpoints

Test the SEP-10 endpoints:

```bash
# Get server info
curl http://localhost:8080/api/sep10/info

# Request challenge
curl -X POST http://localhost:8080/api/sep10/auth \
  -H "Content-Type: application/json" \
  -d '{"account":"GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"}'
```

## Wallet Installation

### Freighter (Recommended)

1. Install from [Chrome Web Store](https://chrome.google.com/webstore/detail/freighter/bcacfldlkkdogcmkkibnjlakofdplcbk)
2. Create or import a wallet
3. Switch to Testnet for testing

### Albedo

1. Visit [albedo.link](https://albedo.link)
2. No installation required - web-based wallet

### xBull

1. Install from [xbull.app](https://xbull.app)
2. Available for mobile and desktop

### Rabet

1. Install from [rabet.io](https://rabet.io)
2. Browser extension wallet

## Troubleshooting

### Backend Issues

**Error: "Failed to create SEP-10 service"**
- Check `SEP10_SERVER_SECRET` is a valid Stellar secret key
- Verify it starts with 'S' and is 56 characters

**Error: "Redis connection failed"**
- Ensure Redis is running: `redis-cli ping`
- Check `REDIS_URL` in `.env`

**Error: "Invalid network passphrase"**
- For testnet: `"Test SDF Network ; September 2015"`
- For mainnet: `"Public Global Stellar Network ; September 2015"`

### Frontend Issues

**Error: "No compatible Stellar wallet found"**
- Install a Stellar wallet extension
- Ensure wallet is unlocked
- Refresh the page after installation

**Error: "Failed to request challenge"**
- Check backend is running
- Verify `NEXT_PUBLIC_API_URL` is correct
- Check browser console for CORS errors

**Error: "Authentication failed"**
- Ensure you're signing with the correct account
- Check wallet is on the correct network (testnet/mainnet)
- Verify time bounds haven't expired

### Common Issues

**Challenge expired**
- Challenges are valid for 5 minutes
- Sign the challenge promptly after requesting

**Replay protection error**
- Each challenge can only be used once
- Request a new challenge if needed

**Session expired**
- Sessions last 7 days by default
- Re-authenticate when session expires

## Production Deployment

### Security Checklist

- [ ] Use HTTPS for all connections
- [ ] Store server secret key securely (environment variables, secrets manager)
- [ ] Use mainnet network passphrase
- [ ] Set proper CORS policies
- [ ] Enable rate limiting on challenge endpoint
- [ ] Use httpOnly cookies for token storage (recommended)
- [ ] Implement session refresh mechanism
- [ ] Set up monitoring and logging
- [ ] Regular security audits

### Environment Configuration

Production `.env`:

```bash
SEP10_SERVER_SECRET=<secure-secret-key>
STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
SEP10_HOME_DOMAIN=yourdomain.com
REDIS_URL=redis://production-redis:6379
JWT_SECRET=<secure-random-string>
```

### Monitoring

Monitor these metrics:
- Challenge request rate
- Verification success/failure rate
- Session creation rate
- Active sessions count
- Redis connection health

## Additional Resources

- [SEP-10 Specification](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md)
- [Stellar Documentation](https://developers.stellar.org)
- [Full Implementation Guide](backend/SEP10_AUTHENTICATION.md)

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the full documentation
3. Check Stellar developer forums
4. Open an issue in the repository
