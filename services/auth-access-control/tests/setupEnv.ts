// Test-only signing key. Real keys come from .env locally and GitHub Actions secrets in CI (SR-16).
process.env.JWT_SIGNING_KEY = process.env.JWT_SIGNING_KEY ?? 'test-only-jwt-signing-key-0123456789abcdef';
