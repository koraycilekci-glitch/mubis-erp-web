/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.mubis.erp',
  appName: 'MUBiS ERP',
  webDir: 'dist',
  server: {
    // 2.7.385: Canlı web uygulamasını yerel webview'da açar.
    // Böylece her web güncellemesi anında uygulamaya yansır; APK güncellemesi gerekmez.
    url: 'https://mubiserp.com',
    cleartext: false,
    allowNavigation: ['mubiserp.com', '*.mubiserp.com', 'gxuqrxmpgoeyykoolmwv.supabase.co']
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0f172a'
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a'
    }
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'APK'
    }
  }
}

module.exports = config
