import {View} from 'aurelia-templating'
import {Observable, Observer, Subscription, ReplaySubject, BehaviorSubject, Subject} from 'rxjs/Rx'

import Cycle from './core' // '@cycle/core' // /lib/index
import rxjsAdapter from '@cycle/rxjs-adapter' // /lib/index
import { DriverFunction } from '@cycle/base'
import {LogManager, FrameworkConfiguration, declarePropertyDependencies, computedFrom, autoinject} from 'aurelia-framework';
import {BindingSignaler} from 'aurelia-templating-resources'

import {ViewEngineHooks} from 'aurelia-templating'

export {Observable, Observer, Subscription, ReplaySubject, BehaviorSubject, Subject} from 'rxjs/Rx'

// for ObservableSignalBindingBehavior
import {Binding, sourceContext, ObserverLocator} from 'aurelia-binding'

export enum BindingType {
  Value,
  Action
}

export function makeBindingDrivers(context) {
  const drivers = {}
  const observables = {}
  Object.keys(context)
    .filter(propName => typeof context[propName].subscribe === 'function')
    // .filter(propName => context[propName] instanceof Observable || context[propName] instanceof AureliaSubjectWrapper)
    .forEach(propName => {
      const observable = context[propName]

      if (observable._bindingType === BindingType.Action)
        enhanceSubjectWithAureliaAction(observable)
      else {
        enhanceSubjectWithAureliaValue(observable)
        observables[propName] = observable
      }

      drivers[propName] = typeof context[propName].next === 'function' && observable._bindingType !== BindingType.Action ? 
      // drivers[propName] = context[propName] instanceof AureliaSubjectWrapper ? 
                makeTwoWayBindingDriver(observable) : makeOneWayBindingDriver(observable)
    }
    // TODO: add setter drivers on non-observable properties
  )
  return { drivers, observables }
}

export function makeTwoWayBindingDriver(bindingObservable: ReplaySubject<any> & { _value: any }) {
  const driverCreator: DriverFunction = function aureliaDriver(value$: Observable<string>) {
    value$.subscribe(newValue => {
      // if (bindingObservable._value !== newValue)
      //   // update the value seen in the view
        // bindingObservable._value = newValue
      bindingObservable.next({ value: newValue, origin: ChangeOrigin.ViewModel })
    })

    return bindingObservable
      .filter(change => change.origin === ChangeOrigin.View)
      .map(change => change.value)
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function makeOneWayBindingDriver(bindingObservable: Observable<any> & { _value: any }) {
  const driverCreator: DriverFunction = function aureliaDriver() {
    return bindingObservable
      .filter(change => change.origin === ChangeOrigin.View)
      .map(change => change.value)
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function configure(frameworkConfig: FrameworkConfiguration) {
  const viewResources = frameworkConfig.aurelia.resources
  const bindingBehaviorInstance = frameworkConfig.container.get(ObservableSignalBindingBehavior)
  viewResources.registerBindingBehavior('observableSignal', bindingBehaviorInstance)
  
  const hooks = {
    beforeBind: function (view: View & {bindingContext}) {
      const context = view.bindingContext
      if (!context || typeof context.cycle !== 'function') return
      // console.log('before bind', view)
      
      const sources = context.cycleDrivers || {}
      const { drivers, observables } = makeBindingDrivers(context)
      
      // bind all observables
      Object.getOwnPropertyNames(observables)
        .forEach(propName => observables[propName]._bind())
      
      context._cycleContextObservables = observables
      
      Object.assign(sources, drivers)
      
      const disposeFunction = Cycle.run(context.cycle.bind(context), sources)
      
      context._cycleDispose = disposeFunction
      
      // const originalUnbind = context.constructor.prototype.unbind as Function || (()=>{})
      // context.unbind = function() {
      //   disposeFunction()
      //   originalUnbind.apply(context, arguments)
      // }
    },
    beforeUnbind: function (view: View & {bindingContext}) {
      const context = view.bindingContext
      if (!context || typeof context.cycle !== 'function') return
      
      const observables = context._cycleContextObservables
      Object.getOwnPropertyNames(observables)
        .forEach(propName => observables[propName]._unbind())
      
      context._cycleDispose()
      
      // console.log('before unbind', view)      
    },
  } as ViewEngineHooks
  
  viewResources.registerViewEngineHooks(hooks)
  /*
  const originalBind = View.prototype.bind as Function
  
  View.prototype.bind = function bind(context: any, overrideContext?: Object, _systemUpdate?: boolean): void {
    originalBind.apply(this, arguments)
    
    if (!context || typeof context.cycle !== 'function') {
      return
    }
    
    const sources = context.cycleDrivers || {}
    Object.assign(sources, makeBindingDrivers(context))
    
    const disposeFunction = Cycle.run(context.cycle.bind(context), sources)
    
    const originalUnbind = context.constructor.prototype.unbind as Function || (()=>{})
    context.unbind = function() {
      disposeFunction()
      originalUnbind.apply(context, arguments)
    }
  }
  */
}


export enum ChangeOrigin {
  View,
  ViewModel
}

export function action() {
  const subject = new Subject<Array<any>>()
  // enhanceSubjectWithAureliaAction(subject)
  subject['_bindingType'] = BindingType.Action
  return subject
}

export function enhanceSubjectWithAureliaAction(subject) {//: Subject<Array<any>>) {
  const invokeMethod = function() {
    subject.next({ origin: ChangeOrigin.View, value: Array.from(arguments) })
    // subject.next(Array.from(arguments))
  }
  
  Object.defineProperty(subject, 'action', {
    get: function() {
      return invokeMethod
    },
    enumerable: true,
    configurable: true
  })
  
  subject['_onValueUpdateCallables'] = new Set()
  
  // return subject
}

export function value<T>(initialValue?: T) {
  const subject = new ReplaySubject<any>(1) as ReplaySubject<any>
  // enhanceSubjectWithAureliaTwoWay(subject, initialValue)
  
  if (initialValue !== undefined) {
    subject.next({ value: initialValue, origin: ChangeOrigin.View })
    // subject.next(initialValue)
  }
  return subject
}

export type ValueAndOrigin<T> = {value: T, origin: ChangeOrigin}

// export class AureliaSubject<T> extends ReplaySubject<T> {
// }
/*
// @autoinject
export class AureliaSubjectWrapper {
  _value;
  
  @computedFrom('_value')
  get value() {
    console.log('getting value')
    return this._value
  }
  set value(value) {
    if (this._value === value) return
    console.log('setting value from view')    
    // set from view
    // this._value = value
    this.observable.next({ value, origin: ChangeOrigin.View })
  }
  
  // constructor(observerLocator: ObserverLocator) {
  //   const observer = observerLocator.getObserver(this, '_value')
  //   observer.subscribe
  // }
  
  constructor(public observable: Subject<any>) {
    observable.subscribe(change => this._value = change.value)
  }
}
*/
/*
const observableGetter = function() {
  return this._value
} as (() => any) & {
  getObserver: (observable: AureliaSubjectWrapper) => { 
    subscribe?: (context, obj) => void,
    unsubscribe?: (context, obj) => void
  }
}

observableGetter.getObserver = function(observableWrapper) {
  return {
    subscribe: function(context, binding) {
      console.log('subscribing to observable', context, binding, observableWrapper)
      
      this.subscription = observableWrapper.observable
        // .filter(change => change.origin === ChangeOrigin.ViewModel)
        .subscribe(next => {
          // if (next.origin === ChangeOrigin.View) return
          // let previousValue = observableWrapper._value
          // observableWrapper._value = next // ensures Aurelia never calls the setter
          console.log('updating target binding with value', next)
          binding.call(context) //, currentValue, previousValue)
          // binding.connect()
          // binding.updateTarget(next.value)
        })
    },
    unsubscribe: function(context, binding) {
      this.subscription.unsubscribe()
    }
  }
}

Object.defineProperty(AureliaSubjectWrapper.prototype, 'value', {
  get: observableGetter,
  set: function(newValue) {
    this._value = newValue
    this.next({ value: newValue, origin: ChangeOrigin.View }) // perhaps an object?
  },
  enumerable: true,
  configurable: true
})
*/

function enhanceSubjectWithAureliaValue<T>(subject: ReplaySubject<T>, initialValue?: T) {
  // subject:  & { _bind:()=>void, _unbind:()=>void }
  subject['_bind'] = function() {
    this._aureliaSubscriptionCount = (this._aureliaSubscriptionCount || 0) + 1
    if (!this._aureliaSubscription)
      this._aureliaSubscription = this.subscribe(change => {
        if (this._value !== change.value) {
          this._value = change.value
          this['_onValueUpdateCallables'].forEach(callable => callable())
        }
      })
  }
  
  subject['_unbind'] = function() {
    this._aureliaSubscriptionCount = (this._aureliaSubscriptionCount || 0) - 1
    if (this._aureliaSubscriptionCount === 0) {    
      this._aureliaSubscription.unsubscribe()
      this._aureliaSubscription = undefined
    }
  }
  
  const getter = function() {
    // console.log('getting', this._value)
    return this._value
  } as (() => any) & { dependencies: Array<string> }
  getter.dependencies = ['_value']

  if (typeof subject.next === 'function')
    Object.defineProperty(subject, 'value', {
      get: getter,
      set: function(newValue) {
        // let relatedBindings:Set<Binding> = this._relatedBindings
        // relatedBindings.forEach(binding => binding.call()) 
        // currentValue = newValue
        if (newValue !== this._value)
          this.next({ value: newValue, origin: ChangeOrigin.View }) // perhaps an object?
      },
      enumerable: true,
      configurable: true
    })
  else
    Object.defineProperty(subject, 'value', {
      get: getter,
      enumerable: true,
      configurable: true
    })

  subject['_onValueUpdateCallables'] = new Set()
  
  /*
  let currentValue = initialValue
  
  const observableGetter = function() {
    return currentValue
  } as (() => any) & {
    getObserver: (observable: Observable<ValueAndOrigin<T>>) => { 
      subscribe?: (context, obj) => void,
      unsubscribe?: (context, obj) => void
    }
  }

  observableGetter.getObserver = function(observable) {
    return {
      subscribe: function(context, binding) {
        console.log('subscribing to observable', context, binding, observable)
        let relatedBindings:Set<Binding> = observable._relatedBindings = observable._relatedBindings || new Set<Binding>()
        relatedBindings.add(binding)
        
        this.subscription = observable
          .filter(change => change.origin === ChangeOrigin.ViewModel)
          .subscribe(next => {
            // if (next.origin === ChangeOrigin.View) return
            let previousValue = currentValue
            currentValue = next.value // ensures Aurelia never calls the setter
            console.log('updating target binding with value', next.value)
            binding.call(context, currentValue, previousValue)
            // binding.connect()
            // binding.updateTarget(next.value)
          })
      },
      unsubscribe: function(context, binding) {
        let relatedBindings:Set<Binding> = observable._relatedBindings
        relatedBindings.delete(binding)
        
        this.subscription.unsubscribe()
      }
    }
  }

  Object.defineProperty(subject, 'value', {
    get: observableGetter,
    set: function(newValue) {
      // let relatedBindings:Set<Binding> = this._relatedBindings
      // relatedBindings.forEach(binding => binding.call()) 
      currentValue = newValue
      this.next({ value: newValue, origin: ChangeOrigin.View }) // perhaps an object?
    },
    enumerable: true,
    configurable: true
  })
  */
  // return new AureliaSubjectWrapper(subject)
}



export class ObservableSignalBindingBehavior {
  bind(binding: Binding & { signalingObservers: Array<{unsubscribe: () => void}>, call: (context)=>void }, source, ...observables: Array<Observable<any>>) {
    // console.log('observableSignal bound', binding, source, observables[0])
    if (!binding.updateTarget) {
      throw new Error('Only property bindings and string interpolation bindings can be signaled.  Trigger, delegate and call bindings cannot be signaled.');
    }
    if (!observables || observables.length === 0)
      throw new Error('Observable parameter is required.')

    const signalingObservers = new Array<{unsubscribe: () => void}>()
    for (let observable of observables) {
      if (observable['_onValueUpdateCallables']) {
        const callable = () => binding.call(sourceContext)
        observable['_onValueUpdateCallables'].add(callable)
        signalingObservers.push({ unsubscribe: () => observable['_onValueUpdateCallables'].remove(callable) })
      }
      else
        signalingObservers.push(
          observable.subscribe(next => binding.call(sourceContext))
          // observable.subscribe(next => {
          //   console.log('calling!')
          //   binding.call(source)
          // })
        )
    }
    binding.signalingObservers = signalingObservers
  }

  unbind(binding: Binding & { signalingObservers: Array<Subscription> }, sourceContext) {
    if (binding.signalingObservers) {
      for (let subscription of binding.signalingObservers) {
        subscription.unsubscribe()
      }
      binding.signalingObservers = undefined
    }
  }
}

// export class ComputedFromSignalBindingBehavior {
//   bind(binding: Binding & { signalingObservers: Array<{unsubscribe: () => void}>, call: (context)=>void }, source, ...observables: Array<Observable<any>>) {
//     // console.log('observableSignal bound', binding, source, observables[0])
//     if (!binding.updateTarget) {
//       throw new Error('Only property bindings and string interpolation bindings can be signaled.  Trigger, delegate and call bindings cannot be signaled.');
//     }
//     if (!observables || observables.length === 0)
//       throw new Error('Observable parameter is required.')

//     const signalingObservers = new Array<{unsubscribe: () => void}>()
//     for (let observable of observables) {
//       if (observable['_onValueUpdateCallables']) {
//         const callable = () => binding.call(sourceContext)
//         observable['_onValueUpdateCallables'].add(callable)
//         signalingObservers.push({ unsubscribe: () => observable['_onValueUpdateCallables'].remove(callable) })
//       }
//       else
//         signalingObservers.push(
//           observable.subscribe(next => binding.call(sourceContext))
//           // observable.subscribe(next => {
//           //   console.log('calling!')
//           //   binding.call(source)
//           // })
//         )
//     }
//     binding.signalingObservers = signalingObservers
//   }

//   unbind(binding: Binding & { signalingObservers: Array<Subscription> }, sourceContext) {
//     if (binding.signalingObservers) {
//       for (let subscription of binding.signalingObservers) {
//         subscription.unsubscribe()
//       }
//       binding.signalingObservers = undefined
//     }
//   }
// }

// not a good idea:

// export class Isolated<T> {
//   /**
//    * any changes will be emitted like:
//    * { property: newValue }
//    */
//   changes: Observable<T>;
  
//   constructor(object: T) {
//     const isolatedObservables = new Array<Observable<any>>()
//     Object.getOwnPropertyNames(object).forEach(
//       property => {
//         // const newSubject = property.toLowerCase().match('action') ? new Subject() : new ReplaySubject<any>(1) //changable(object[property])
        
//         // initial value should be undefined if a Subject is to be created
//         const newSubject = object[property] === undefined ? new Subject() : new ReplaySubject<any>(1) //changable(object[property])
//         // emit initial value
//         if (object[property] !== undefined)
//           newSubject.next(object[property])

//         this[property] = newSubject
        
//         isolatedObservables.push(
//           this[property].map(value => ({ [property]: value }))
//           //   .filter(change => change.binding !== 'update') // all changes except external updates
//           //   .map(change => ({ [property]: change.value }))
//         )
//       }
//     )
//     this.changes = Observable.merge<T, T>(...isolatedObservables)
//   }
  
//   update(newValues: T) {
//     Object.getOwnPropertyNames(newValues).forEach(
//       property => this[property].next(newValues[property])
//     )
//   }
// }
