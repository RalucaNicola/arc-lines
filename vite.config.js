import { defineConfig } from 'vite';
import dns from 'dns';

dns.setDefaultResultOrder('verbatim');

export default defineConfig(() => {
    return {
        publicDir: 'public/',
        server: {
            port: 3000
        },
        base: './',
    };
});
