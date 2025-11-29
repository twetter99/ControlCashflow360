/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ============================================
  // 🔒 SECURITY HEADERS
  // ============================================
  async headers() {
    return [
      {
        // Aplicar a todas las rutas
        source: '/:path*',
        headers: [
          // Prevenir clickjacking - no permitir que la página se muestre en iframes
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // Prevenir MIME type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Habilitar protección XSS del navegador
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // Controlar información enviada en el header Referer
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Forzar HTTPS (HSTS) - 1 año
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          // Controlar qué APIs del navegador puede usar la página
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // Content Security Policy - Política de seguridad de contenido
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.firebaseapp.com https://*.googleapis.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https: blob:",
              "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.firebase.google.com wss://*.firebaseio.com",
              "frame-src 'self' https://*.firebaseapp.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
      {
        // Headers específicos para API routes
        source: '/api/:path*',
        headers: [
          // No cachear respuestas de API por defecto
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ];
  },

  // ============================================
  // Powered By Header - Ocultar tecnología
  // ============================================
  poweredByHeader: false,
}

module.exports = nextConfig
