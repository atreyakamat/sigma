# Included by every location in nginx.conf: nginx drops server-level add_header directives as soon #
as a location declares its own, so the security headers must be repeated per location. add_header
X-Content-Type-Options "nosniff" always; add_header X-Frame-Options "SAMEORIGIN" always; add_header
Referrer-Policy "strict-origin-when-cross-origin" always; add_header Permissions-Policy "camera=(),
microphone=(), geolocation=()" always; add_header Content-Security-Policy "default-src 'self';
script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'
data:; connect-src 'self' ws: wss:; worker-src 'self' blob:; frame-ancestors 'self'; base-uri
'self'; form-action 'self'" always;
