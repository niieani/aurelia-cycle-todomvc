import 'todomvc-common/base.css'
import 'todomvc-app-css/index.css'

import {Observable, Subject, ReplaySubject, Subscription} from 'rxjs/Rx'
import {action, oneWay, twoWay, signal, collection, CycleSourcesAndSinks, ChangeOrigin, CycleContext, ContextChanges, ChangeType} from '../cycle/plugin'
import {computedFrom} from 'aurelia-framework'
import {TodoItem} from './todo-item'

export class Todos { // implements CycleDriverContext
  // changes$: Subject<ContextChanges>
  
  @action addNewTodoActions
  @action destroyTodo
  @twoWay newTodoTitle
  
  @signal completions
  @signal creationsAndDestructions
  
  @collection todos // = new Array<TodoItem>()
  @action filter
  @oneWay currentFilter
  
  @action toggleAll
  @action clearCompleted
  
  cycle({ addNewTodoActions$, destroyTodo$, newTodoTitle$, filter$, todos$, clearCompleted$ }: CycleSourcesAndSinks & { todos$: Observable<ContextChanges> }): CycleSourcesAndSinks {
    const newTodoProspective$ = addNewTodoActions$.withLatestFrom(
      newTodoTitle$, 
      (action, title) => title as string
    )
    
    const newTodo$ = newTodoProspective$
      .filter(title => title != '')
      .map(title => ({ action: 'add', item: new TodoItem(title, false, this.destroyTodo, this.toggleAll) })) //, this.clearCompleted
    
    // every time a new todo is created, reset title
    newTodoTitle$ = newTodoTitle$
      .merge(newTodo$.map(todo => ''))

    const removedTodo$ = destroyTodo$
      .map(args => ({ action: 'remove', item: args[0] }))
    
    clearCompleted$ = clearCompleted$.map(() => ({
      action: 'do',
      where: (item: TodoItem) => item.isCompleted,
      do: (item: TodoItem) => this.destroyTodo(item)
    }))
    
    const todoChanges$ = Observable
      .merge(newTodo$, removedTodo$, clearCompleted$)
    
    const currentFilter$ = filter$
      .map(args => args[0])
      .startWith('all')
      .distinctUntilChanged()
    
    // Trigger when any of todo.completed changes
    // so that we can update the filter
    const completions$ = todos$
      .filter(change => change.property === 'isCompleted')

    // Trigger when we create and destroy any Todos to update the X left count
    const creationsAndDestructions$ = 
      todos$.filter(change => change.type === ChangeType.Unbind || change.type === ChangeType.Bind)
    
    // todos$.subscribe(next => console.log('next', next))

    return {
      todos$: todoChanges$,
      newTodoTitle$,
      currentFilter$,
      completions$,
      creationsAndDestructions$
    }
  }
}

export class FilterTodoValueConverter {
  toView(todos: Array<TodoItem>, currentFilter) {
    // console.log('filtering:', todos, currentFilter)
    
    switch (currentFilter) {
      case 'active':
        return todos.filter(todo => !todo.isCompleted)
      case 'completed':
        return todos.filter(todo => !!todo.isCompleted)
      default:
        return todos
    }
  }
}

export class CountIncompleteValueConverter {
  toView(todos: Array<TodoItem>) {
    const count = todos ? todos.filter(todo => !todo.isCompleted).length : 0
    return count
  }
}

export class CountCompleteValueConverter {
  toView(todos: Array<TodoItem>) {
    const count = todos ? todos.filter(todo => todo.isCompleted).length : 0
    return count
  }
}

export class AnyValueConverter {
  toView(count: number) {
    return count > 0
  }
}
