import {Aurelia} from 'aurelia-framework';
import {Router, RouterConfiguration} from 'aurelia-router';

// font-awesome requires some fonts and thus cannot be required from within the View
import 'font-awesome/css/font-awesome.css';
import '../../styles/styles.css';

export class App {
  router: Router;

  configureRouter(config: RouterConfiguration, router: Router) {
    config.title = 'Aurelia';
    config.map([
      { route: ['', 'welcome'], name: 'welcome',   moduleId: './welcome',  nav: true, title: 'Welcome' },
      { route: 'counter',       name: 'counter',   moduleId: './counter',  nav: true, title: 'Counter' }
    ]);

    this.router = router;
  }
}
