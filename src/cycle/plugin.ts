import {View} from 'aurelia-templating'
import {Observable, Observer, Subscription, ReplaySubject, BehaviorSubject, Subject} from 'rxjs/Rx'

import Cycle from './core' // '@cycle/core' // /lib/index
import rxjsAdapter from '@cycle/rxjs-adapter' // /lib/index
import { DriverFunction } from '@cycle/base'
import {LogManager, FrameworkConfiguration, declarePropertyDependencies, computedFrom} from 'aurelia-framework';
import {BindingSignaler} from 'aurelia-templating-resources'

export {Observable, Observer, Subscription, ReplaySubject, BehaviorSubject, Subject} from 'rxjs/Rx'

// for ObservableSignalBindingBehavior
import {Binding, sourceContext} from 'aurelia-binding'

export function makeBindingDrivers(context) {
  const drivers = {}
  Object.keys(context)
    .filter(propName => typeof context[propName].subscribe === 'function')
    .forEach(propName => {
      const observable = context[propName]
      drivers[propName] = typeof context[propName].next === 'function' ? 
                makeTwoWayBindingDriver(observable) : makeOneWayBindingDriver(observable)
    }
    // TODO: add setter drivers on non-observable properties
  )
  return drivers
}

export function makeTwoWayBindingDriver(bindingObservable: Subject<any> & { _value: any }) {
  const driverCreator: DriverFunction = function aureliaDriver(value$: Observable<string>) {
    value$.subscribe(newValue => {
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
  
  const originalBind = View.prototype.bind as Function
  
  View.prototype.bind = function bind(context: any, overrideContext?: Object, _systemUpdate?: boolean): void {
    originalBind.apply(this, arguments)
    
    if (!context || typeof context.cycle != 'function') {
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
}


export enum ChangeOrigin {
  View,
  ViewModel
}

export function action() {
  return enhanceSubjectWithAureliaAction(new Subject<ValueAndOrigin<Array<any>>>())
}

export function enhanceSubjectWithAureliaAction(subject: Subject<ValueAndOrigin<Array<any>>>) {
  const invokeMethod = function() {
    subject.next({ origin: ChangeOrigin.View, value: Array.from(arguments) })
  }
  
  Object.defineProperty(subject, 'action', {
    get: function() {
      return invokeMethod
    },
    enumerable: true,
    configurable: true
  })
  
  return subject
}

export function value<T>(initialValue?: T) {
  const subject = new ReplaySubject<any>(1) as ReplaySubject<any>
  return enhanceSubjectWithAureliaTwoWay(subject, initialValue)
}

export type ValueAndOrigin<T> = {value: T, origin: ChangeOrigin}

// export class AureliaSubject<T> extends ReplaySubject<T> {
// }

export class AureliaSubjectWrapper {
  _value;
  
  @computedFrom('_value')
  get value() {
    console.log('getting value')
    return this._value
  }
  set value(value) {
    console.log('setting value from view')    
    // set from view
    // this._value = value
    this.observable.next(value)
  }
  
  constructor(public observable: Subject<any>) {
    observable.subscribe(value => this._value = value)
  }
}

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

function enhanceSubjectWithAureliaTwoWay<T>(subject: ReplaySubject<ValueAndOrigin<T>>, initialValue?: T) {
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
  
  if (initialValue !== undefined) {
    subject.next({ value: initialValue, origin: ChangeOrigin.View })
  }
  
  return subject
}



export class ObservableSignalBindingBehavior {
  bind(binding: Binding & { signalingObservers: Array<Subscription>, call: (context)=>void }, source, ...observables: Array<Observable<any>>) {
    if (!binding.updateTarget) {
      throw new Error('Only property bindings and string interpolation bindings can be signaled.  Trigger, delegate and call bindings cannot be signaled.');
    }
    if (!observables || observables.length === 0)
      throw new Error('Observable name is required.')

    const signalingObservers = new Array<Subscription>()
    for (let observable of observables) {
      signalingObservers.push(
        observable.subscribe(next => binding.call(sourceContext))
      )
    }
    binding.signalingObservers = signalingObservers
  }

  unbind(binding: Binding & { signalingObservers: Array<Subscription> }, source) {
    if (binding.signalingObservers) {
      for (let subscription of binding.signalingObservers) {
        subscription.unsubscribe()
      }
      binding.signalingObservers = undefined
    }
  }
}



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
