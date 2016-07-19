import {Observable} from 'rxjs/Rx'
import {bindable, useView} from 'aurelia-framework'
import {cycle, action, oneWay, twoWay, collection, communicatesWithParent, CycleSourcesAndSinks} from 'aurelia-cycle'

const ENTER_KEY = 13
const ESC_KEY = 27

// @useView('./todo-item.html')
@communicatesWithParent
// @cycle
export class TodoItem {
  // You may define additional drivers here:
  // cycleDrivers = { }
  
  @bindable state = {}
  
  constructor(
    title: string,
    completed: boolean
  ) {
    this.title = title
    this.isCompleted = completed
  }
  created(owningView, myView) {
    console.log('created', owningView, myView);
  }
  
  @twoWay title
  @twoWay newTitle
  @twoWay isCompleted
  @oneWay isEditing
  
  // internal actions
  @action editingStarted
  @action keyUp
  @action doneEdit
  // actions forwarded as messages to parent
  @action destroy
  
  cycle({ editingStarted$, keyUp$, doneEdit$, title$, newTitle$, isCompleted$, parent$, destroy$ }: CycleSourcesAndSinks): CycleSourcesAndSinks {
    const cancelEdit$ = keyUp$
      .filter((action) => (action[0] as KeyboardEvent).keyCode === ESC_KEY)

    // allow either 'enter' or 'blur' to finish editing
    doneEdit$ = keyUp$
      .filter((action) => (action[0] as KeyboardEvent).keyCode === ENTER_KEY)
      .merge(doneEdit$)
      // blur is gonna happen shortly after ENTER, so don't act on it twice
      .throttleTime(300)
    
    // blur is gonna happen shortly after ESC too, so don't act on it twice
    const editingApproval$ = cancelEdit$
      .map(() => true)
      .merge(doneEdit$.map(() => false))
      .throttleTime(300)

    const editingAccepted$ = editingApproval$.filter((wasCancelled) => wasCancelled === false)
    const editingCancelled$ = editingApproval$.filter((wasCancelled) => wasCancelled === true)
    
    // create a stream that emits booleans that represent
    // the "is editing" state.
    const isEditing$ = Observable
      .merge(
        editingStarted$.map(() => true),
        editingAccepted$.map(() => false),
        editingCancelled$.map(() => false)
      )
      .startWith(false)
      .distinctUntilChanged()
    
    // sync initial title with newTitle upon start of editing
    const newTitleNext$ = editingStarted$
      .withLatestFrom(title$, (action, title) => title)
    
    const newAcceptedTodoName$ = editingAccepted$
      .withLatestFrom(newTitle$, (action, title) => title.trim())
    
    // when somebody renames a todo, save changes to the title after successful edit
    const titleNext$ = newAcceptedTodoName$
      .filter(title => title !== '')
      
    // or when the new name is empty, ask the parent to destroy
    const destroyMessages$ = newAcceptedTodoName$
      .filter(title => title === '')
      .merge(destroy$, parent$.filter(message => message === 'destroy'))
      .map(() => 'destroy')

    // we only message the parent about destructions
    const messagesForParent$ = destroyMessages$

    // the parent can ask us to tick or untick ourselves
    const toggledIsCompleted$ = parent$
      .filter(message => message === 'tick' || message === 'untick')
      .map(message => message === 'tick' ? true : false)
    
    return {
      isEditing$,
      parent$: messagesForParent$,
      newTitle$: newTitleNext$,
      title$: titleNext$,
      isCompleted$: toggledIsCompleted$
    }
  }
}
