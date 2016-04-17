import {Observable} from 'rxjs/Rx'
import {bindable, useView} from 'aurelia-framework'
import {action, oneWay, twoWay, collection, CycleSourcesAndSinks} from '../cycle/plugin'

const ENTER_KEY = 13
const ESC_KEY = 27

@useView('./todo-item.html')
export class TodoItem {
  // You may define additional drivers here:
  // cycleDrivers = { }
  
  constructor(
    title: string,
    completed: boolean, 
    destroy, 
    toggle
  ) {
    this.title = title
    this.isCompleted = completed
    // external actions
    this.destroy = destroy
    this.toggle = toggle
  }
  
  @twoWay title;
  @twoWay newTitle;
  @twoWay isCompleted;
  @oneWay isEditing;
  
  // internal actions
  @action editingStarted;
  @action keyUp;
  @action doneEdit;
  
  // external actions
  @action destroy;
  @action toggle;
  
  cycle({ editingStarted$, keyUp$, doneEdit$, title$, newTitle$, toggle$, isCompleted$ }: CycleSourcesAndSinks): CycleSourcesAndSinks {
    const cancelEdit$ = keyUp$
      .filter((action) => (action[0] as KeyboardEvent).keyCode === ESC_KEY)

    // Allow either enter or blur to finish editing
    doneEdit$ = keyUp$
      .filter((action) => (action[0] as KeyboardEvent).keyCode === ENTER_KEY)
      .merge(doneEdit$)
      // blur is gonna happen shortly after ENTER, so don't act on it twice
      .throttleTime(300)
    
    // blur is gonna happen shortly after ESC, so don't act on it twice
    const editingApproval$ = cancelEdit$
      .map(() => true)
      .merge(doneEdit$.map(() => false))
      .throttleTime(300)

    const editingAccepted$ = editingApproval$.filter((wasCancelled) => wasCancelled === false)
    const editingCancelled$ = editingApproval$.filter((wasCancelled) => wasCancelled === true)
    
    // Create a stream that emits booleans that represent the
    // "is editing" state.
    const isEditing$ = Observable
      .merge(
        editingStarted$.map(() => true),
        editingAccepted$.map(() => false),
        editingCancelled$.map(() => false)
      )
      .startWith(false)
      .distinctUntilChanged()
    
    // Destroy when somebody gives a todo an empty name
    const destroy$ = editingAccepted$
      .withLatestFrom(newTitle$, (action, title) => title)
      .filter(title => title === '')
      .map(title => [this])
    
    // Sync initial title with newTitle upon start of editing
    const newTitleNext$ = editingStarted$
      .withLatestFrom(title$, (action, title) => title)

    // Save changes to the title after successful edit
    const titleNext$ = editingAccepted$
      .withLatestFrom(newTitle$, (action, title) => title)
      .filter(title => title !== '')
    
    const toggledIsCompleted$ = toggle$
      .withLatestFrom(isCompleted$, (toggle, isCompleted) => true)
    
    return {
      isEditing$,
      destroy$,
      newTitle$: newTitleNext$,
      title$: titleNext$,
      isCompleted$: toggledIsCompleted$
    }
  }
}
