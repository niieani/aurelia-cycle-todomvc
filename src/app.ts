import {Router, RouterConfiguration} from 'aurelia-router';

export class App {
  router: Router;

  configureRouter(config: RouterConfiguration, router: Router) {
    config.title = 'Aurelia';
    config.map([
      { route: ['', 'examples'], name: 'examples',   moduleId: './examples/app',  nav: true, title: 'Examples' },
      { route: 'todomvc',        name: 'todomvc',    moduleId: './todomvc/app',   nav: true, title: 'TodoMVC'  }
    ]);

    this.router = router;
  }
}
