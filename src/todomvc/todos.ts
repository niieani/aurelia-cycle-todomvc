import 'todomvc-common/base.css'
import 'todomvc-app-css/index.css'

import {Observable, Subject, ReplaySubject, Subscription} from 'rxjs/Rx'
import {action, oneWay, twoWay, signal, collection, CycleSourcesAndSinks, ChangeOrigin, CycleContext, ContextChanges, ChangeType} from 'aurelia-cycle'
import {TodoItem} from './todo-item'
import {activationStrategy} from 'aurelia-router';

export class Todos { // implements CycleDriverContext
  @action addNewTodo
  @twoWay newTodoTitle
  
  @signal completions
  @signal creationsAndDestructions
  
  @collection todos
  @oneWay currentFilter
  
  @action toggleAll
  @action clearCompleted
  
  cycle({ addNewTodo$, newTodoTitle$, todos$, clearCompleted$, toggleAll$ }: CycleSourcesAndSinks & { todos$: Observable<ContextChanges> }): CycleSourcesAndSinks {
    // snapshot a name after it's submitted, filter empty values
    const newTodoProspective$ = addNewTodo$.withLatestFrom(
        newTodoTitle$, 
        (action, title: string) => title.trim()
      ).filter(title => !!title)
    
    const todoCreations$ = newTodoProspective$
      .map(title => ({ action: 'add', item: new TodoItem(title, false) }))

    // every time a new todo is created, reset title
    newTodoTitle$ = todoCreations$.map(todo => '')

    // todos can ask to be removed via messages
    const todoRemovals$ = todos$
      .filter(change => change.type === ChangeType.Message && change.value === 'destroy')
      .map(change => ({ action: 'remove', item: change.item }))
    
    // ask only completed todos to destroy themselves
    clearCompleted$ = clearCompleted$.map(() => ({
      action: 'remove',
      where: (item: TodoItem) => item.isCompleted
    }))
    
    // ask todos to tick themselves under specific circumstances
    const toggleCompletions$ = toggleAll$.map(() => ({
      action: 'message', // NOTE: currently only messages bound elements //
      ifSome: (item: TodoItem) => !item.isCompleted,
      message: 'tick',
      else: {
        ifAll: (item: TodoItem) => item.isCompleted,
        message: 'untick'
      }
    }))
    
    const todoChanges$ = Observable
      .merge(todoCreations$, todoRemovals$, clearCompleted$, toggleCompletions$)
    
    // signal when any of todo.completed changes
    // so that we can update the filter
    const completions$ = todos$
      .filter(change => change.property === 'isCompleted')

    // signal when we create and destroy todos
    const creationsAndDestructions$ = 
      todos$.filter(change => 
        // change.type === ChangeType.Unbind || change.type === ChangeType.Bind ||
        change.type === ChangeType.Add || change.type === ChangeType.Remove
      )

    return {
      todos$: todoChanges$,
      newTodoTitle$,
      completions$,
      creationsAndDestructions$
    }
  }
  
	activate(params, routeConfig) {
    // TODO: perhaps integrate into cycle via a driver?
    this.currentFilter = routeConfig.name;
	}
  
  determineActivationStrategy() {
    return activationStrategy.invokeLifecycle;
  }
  
  // changes$: Subject<ContextChanges>
}

export class FilterTodoValueConverter {
  toView(todos: Array<TodoItem>, currentFilter) {
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

export class AllCompleteValueConverter {
  toView(todos: Array<TodoItem>) {
    return todos ? todos.every(todo => todo.isCompleted) : false
  }
}

export class AnyValueConverter {
  toView(count: number) {
    return count > 0
  }
}
