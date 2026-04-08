// src/config/api.ts
const API_CONFIG = {
  development: {
    baseUrl: 'http://localhost:8080/api',
    services: {
      user: 'http://localhost:8081/v3/api-docs',
      auth: 'http://localhost:8082/v3/api-docs',
    },
  },
  production: {
    baseUrl: 'https://api.3deditor.com/api',
    services: {
      user: 'https://service-user.3deditor.com/v3/api-docs',
      auth: 'https://service-auth.3deditor.com/v3/api-docs',
    },
  },
}

export const getApiConfig = () => {
  return API_CONFIG[import.meta.env.MODE as keyof typeof API_CONFIG] || API_CONFIG.development
}
