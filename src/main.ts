import {Aurelia} from 'aurelia-framework';
import {bootstrap} from 'aurelia-bootstrapper-webpack';
// import './cycle/index'

// height: 40px;
bootstrap((aurelia: Aurelia): void => {
  aurelia.use
    .standardConfiguration()
    .developmentLogging();

  aurelia.use.plugin('cycle/plugin');

  aurelia.start().then(() => aurelia.setRoot('cycle-todomvc/todos', document.body));
  // aurelia.start().then(() => aurelia.setRoot('app', document.body));
});
