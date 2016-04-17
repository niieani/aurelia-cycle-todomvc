// Generated by typings
// Source: node_modules/aurelia-bootstrapper-webpack/dist/commonjs/aurelia-bootstrapper-webpack.d.ts
declare module 'aurelia-bootstrapper-webpack' {
  import 'aurelia-polyfills';
  import {
    initialize
  } from 'aurelia-pal-browser';
  import {
    WebpackLoader
  } from 'aurelia-loader-webpack';
  
  /**
   * Manually bootstraps an application.
   * @param configure A callback which passes an Aurelia instance to the developer to manually configure and start up the app.
   * @return A Promise that completes when configuration is done.
   */
  export function bootstrap(configure: Function): Promise<void>;
}