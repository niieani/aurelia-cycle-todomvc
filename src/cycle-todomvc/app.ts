import {Aurelia} from 'aurelia-framework';
import {Router, RouterConfiguration} from 'aurelia-router';

export class App {
  router: Router;

  configureRouter(config: RouterConfiguration, router: Router) {
    this.router = router;
    config.title = 'TodoMVC Aurelia Cycle';
    config.map([
      { route: ['', 'all'], name: 'all', moduleId: './todos', title: 'All', nav: true },
      { route: 'active', name: 'active', moduleId: './todos', title: 'Active', nav: true },
      { route: 'completed', name: 'completed', moduleId: './todos', title: 'Completed', nav: true }
    ])
  }
}
