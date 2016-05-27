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

/**
 * TODO:
 * - hook immediately after ViewModel creation (run cycle if not already running!) : https://github.com/aurelia/templating/blob/a56b7440b4c0a30236088aedf30885983f142dc1/src/composition-engine.js#L161
 * - run cycle when created either in CollectionDriver or ViewModelDriver [so that the cycle can be running even if not bound]
 * - activate, bind, attached, etc... can be simple actions$
 * - run the first cycle in the App class (?)
 * - placeholder drivers for drivers which are generated from data (?)
 * - how do we handle complex objects, perhaps with arrays on the ViewModel?
 *    - perhaps we could declare the expected model in a @decorator?  
 * - who is responsible for disposing of cycle will depend on who run it:
 *   - if the view was run from a CollectionDriver or ViewModelDriver, it should be responsible for that (and hook the parent views)
 *   - we could have a destroy/dispose() method on the ViewModels that is called when the ViewModel is permanently disposed of (removed from a collection / parent called it's own dispose) 
 */
