import {Observable} from 'rxjs/Rx'

import {bindable, useView} from 'aurelia-framework'

import {action as a, value as v} from '../cycle/plugin'

const ENTER_KEY = 13
const ESC_KEY = 27

@useView('./todo-item.html')
export class TodoItem {
  // cycleDrivers = { TodoItemView: makeAureliaDriver(this) }
  
  constructor(title, completed, public destroy$) {
    this.title$ = v(title)
    this.isCompleted$ = v(completed)
    // console.log('new todo', this.title$)
  }
  
  bind() {
    // console.log('bind WTF')
  }
  
  unbind() {}
  
  title$: Observable<string>; // = v(); //AureliaSubjectWrapper;
  isCompleted$; // = v(); // AureliaSubjectWrapper; // = v()
  isEditing$ = v()
  
  startEdit$ = a()
  keyUp$ = a()
  doneEdit$: Observable<any> = a()
  
  cycle({ startEdit$, keyUp$, doneEdit$, title$ }: this) {
    console.log('cycling ITEM', this)
    // startEdit.subscribe(next => console.log('starting edit', next))

    const cancelEdit$ = keyUp$
      .filter((action) => (action[0] as KeyboardEvent).keyCode === ESC_KEY)

    doneEdit$ = keyUp$
      .filter((action) => (action[0] as KeyboardEvent).keyCode === ENTER_KEY)
      .merge(doneEdit$)
      .throttleTime(300)
      
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
      .distinctUntilChanged()
      // .do(next => console.log('is editing', next))
    
    const destroy$ = doneEdit$
      .withLatestFrom(title$, (action, title) => title)
      .filter(value => value === '')
      .map(title => [this])
    // destroy$.subscribe(next => console.log('would destryo'))
    
    return {
      isEditing$,
      destroy$
    }
  }
}
