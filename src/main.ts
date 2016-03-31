import {Aurelia} from 'aurelia-framework';
import {bootstrap} from 'aurelia-bootstrapper-webpack';
// import './cycle/index'

import 'bootstrap/dist/css/bootstrap.css';
import 'font-awesome/css/font-awesome.css';
import '../styles/styles.css';

bootstrap((aurelia: Aurelia): void => {
  aurelia.use
    .standardConfiguration()
    .developmentLogging();

  aurelia.use.plugin('cycle/plugin');

  aurelia.start().then(() => aurelia.setRoot('cycle-todomvc/todos', document.body));
  // aurelia.start().then(() => aurelia.setRoot('app', document.body));
});
