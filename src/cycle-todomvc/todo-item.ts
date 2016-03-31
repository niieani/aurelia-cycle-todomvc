import {Observable} from 'rxjs/Rx'

import {bindable} from 'aurelia-framework'

import {action as a, value as v} from '../cycle/plugin'

const ENTER_KEY = 13
const ESC_KEY = 27

export class TodoItem {
  // cycleDrivers = { TodoItemView: makeAureliaDriver(this) }
  
  // public values
  // @bindable title;
  // @bindable completed;
  // // @bindable destroyAction;
  // @bindable destroy;
  // editing = c(true);
  // // something = true;
  // @bindable publicProps;
  // bind() {
  //   console.log('bind item', this)
  //   // delete this.destroyAction
  // }
  
  constructor(title, completed, public destroy) {
    // this.title.next({ value: title })
    // this.completed.next({ value: completed })
    this.title$ = v(title)
    this.isCompleted$ = v(completed)
  }
  
  title$;
  isCompleted$; // = v()
  isEditing$ = v()
  
  startEdit$ = a()
  keyUp$ = a()
  doneEdit$: Observable<any> = a()
  
  cycle({ startEdit$, keyUp$, doneEdit$ }: this) {
    // startEdit.subscribe(next => console.log('starting edit', next))

    const cancelEdit$ = keyUp$
      .filter((action) => (action[0] as KeyboardEvent).keyCode === ESC_KEY)

    doneEdit$ = keyUp$
      .filter((action) => (action[0] as KeyboardEvent).keyCode === ENTER_KEY)
      .merge(doneEdit$)
      
    // THE EDITING STREAM
    // Create a stream that emits booleans that represent the
    // "is editing" state.
    const isEditing$ = Observable
      .merge(
        startEdit$.map(() => true),
        doneEdit$.map(() => false),
        cancelEdit$.map(() => false)
      )
      .startWith(false)
    
    return {
      isEditing$
    }
  }
}
