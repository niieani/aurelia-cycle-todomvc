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
  Action,
  Collection
}

export enum ValueType {
  Value,
  Action
}

export enum ChangeOrigin {
  View,
  ViewModel
}

interface BindingChange<T> {
  value: T;
  origin: ChangeOrigin;
  type: ValueType;
}

interface ContextChanges extends BindingChange<any> {
  property: string;
}

interface CollectionChanges<T> extends ContextChanges {
  item: T;
}

interface CollectionChange<T> {
  action: 'added' | 'removed';
  item: T & { cycleChanges: Observable<ContextChanges> };
}

export type Collection<T> = Subject<CollectionChanges<T>> & { value: Array<T> }

export function makeBindingDrivers(context) {
  const drivers = {}
  const observables = {}
  
  // mega-observable
  let cycleChanges: Subject<ContextChanges> = context.cycleChanges || new Subject<ContextChanges>()
  
  Object.keys(context)
    .filter(propName => typeof context[propName].subscribe === 'function')
    .forEach(propName => {
      const observable = context[propName] as ReplaySubject<any> & { _bindingType; _value }
      
      // if (typeof observable.next === 'function') {
      observable['_contextChange'] = (change: BindingChange<any>) => cycleChanges.next({ property: propName, value: change.value, origin: change.origin, type: change.type })
      
      if (observable instanceof ReplaySubject) {
        const tempSub = observable.subscribe(change => observable['_contextChange'](change))
      }
      // }
      // 
      // if (!context._cycleChangesMerged) {
      //   cycleChanges
      //   observable
      //     .map(change => ({ property: propName, value: change.value, origin: change.origin }))
      //   // cycleChanges = cycleChanges.merge(observable.map(change => ({ property: propName, value: change.value, origin: change.origin })))
      // }
      
      observables[propName] = observable
      
      switch (observable._bindingType) {
        case BindingType.Action:
          // enhanceSubjectWithAureliaAction(observable)
          drivers[propName] = makeOneWayBindingDriver(observable)
          break
        case BindingType.Collection:
          drivers[propName] = makeCollectionBindingDriver(observable)
          break
        case undefined:
          enhanceSubjectWithAureliaValue(observable)
          // NOTE: fallthrough intentional!
        default:
          drivers[propName] = typeof observable.next === 'function' ? 
                makeTwoWayBindingDriver(observable) : makeOneWayBindingDriver(observable)
      }

    }
    // TODO: add setter drivers on non-observable properties
  )
  if (!context.cycleChanges) {
    context.cycleChanges = cycleChanges
    // context._cycleChangesMerged = true
    // drivers['cycleChanges'] = makeOneWayBindingDriver(cycleChanges)
  }
  return { drivers, observables }
}

export function makeTwoWayBindingDriver(bindingObservable: ReplaySubject<any> & { _value?: any }) {
  const driverCreator: DriverFunction = function aureliaDriver(value$: Observable<string>) {
    value$.subscribe(newValue => {
      const value = { value: newValue, origin: ChangeOrigin.ViewModel, type: ValueType.Value }
      bindingObservable.next(value)
      
      if (bindingObservable['_contextChange'])
        bindingObservable['_contextChange'](value)
    })

    return bindingObservable
      .filter(change => change.origin === ChangeOrigin.View)
      .map(change => change.value)
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function makeOneWayBindingDriver(bindingObservable: Observable<any> & { _value?: any }) {
  const driverCreator: DriverFunction = function aureliaDriver() {
    return bindingObservable
      .filter(change => change.origin === ChangeOrigin.View)
      .map(change => change.value)
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function makeCollectionBindingDriver(collectionObservable: Observable<CollectionChange<{}>> & { value?: Array<any> }) {
  const driverCreator: DriverFunction = function collectionDriver(collectionChanges$: Subject<CollectionChange<{}>>) {
    const allInternalChanges$ = new Subject<CollectionChanges<{}>>()
    const contextChangeTrigger = collectionObservable['_contextChange']
    const subscriptionMap = new WeakMap<any, Subscription>()
    // const array = new Array()
    const array = collectionObservable.value
    const subscriptions = new Set<Subscription>()
    collectionObservable['_collectionSubscriptions'] = subscriptions
    
    collectionChanges$.subscribe(collectionChange => {
      console.log('collection change', collectionChange)
      if (collectionChange.action == 'added') {
        if (array.indexOf(collectionChange.item) >= 0) return

        array.push(collectionChange.item)
        
        if (!collectionChange.item.cycleChanges) {
          collectionChange.item.cycleChanges = new Subject<ContextChanges>()
        }
        const subscription = collectionChange.item.cycleChanges.subscribe(change => {
          const value = { item: collectionChange.item, property: change.property, origin: change.origin, value: change.value, type: change.type } 
          allInternalChanges$.next(value)
          if (contextChangeTrigger) {
            contextChangeTrigger(value)
          }
        }
        )
        subscriptionMap.set(
          collectionChange.item, 
          subscription
        )
        subscriptions.add(subscription)
      }
      else {
        const index = array.indexOf(collectionChange.item)
        if (array.indexOf(collectionChange.item) < 0) return
        
        const subscription = subscriptionMap.get(collectionChange.item)
        if (subscription) {
          subscription.unsubscribe()
          subscriptions.delete(subscription)
        }
        
        array.splice(array.indexOf(collectionChange.item), 1)
      }
    })
    return allInternalChanges$
    
    /**
     * mass trigger - always trigger callables of a certain name
     * i.e.
     * title, completed =>
     * context.cycleChanges.next({ property, name, origin })
     */
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function action() {
  const subject = new Subject<Array<any>>()
  enhanceSubjectWithAureliaAction(subject)
  return subject
}

export function enhanceSubjectWithAureliaAction(subject) {//: Subject<Array<any>>) {
  if (subject['_bindingType'] !== undefined) return
  
  const invokeMethod = function() {
    const value = { origin: ChangeOrigin.View, value: Array.from(arguments), type: BindingType.Action }
    subject.next(value)
    
    if (subject['_contextChange'])
      subject['_contextChange'](value)
    // subject.next(Array.from(arguments))
  }
  
  Object.defineProperty(subject, 'action', {
    get: function() {
      return invokeMethod.bind(this)
    },
    enumerable: true,
    configurable: true
  })
  
  subject['_bindingType'] = BindingType.Action
}

export function value<T>(initialValue?: T) {
  let subject = new ReplaySubject<any>(1) as ReplaySubject<any>
  
  if (initialValue !== undefined) {
    const value = { value: initialValue, origin: ChangeOrigin.View, type: BindingType.Value }
    subject.next(value)
    // subject = subject.startWith(value)
    
    // if (subject['_contextChange'])
    //   subject['_contextChange'](value)
      
    // else
    //   subject['_replyForContext'] = value
    // subject.next(initialValue)
  }
  return subject as Observable<T>
}

export type ValueAndOrigin<T> = {value: T, origin: ChangeOrigin}

function enhanceSubjectWithAureliaValue<T>(subject: ReplaySubject<ValueAndOrigin<T>>, initialValue?: T) {
  if (subject['_bindingType'] !== undefined) return

  subject['_bind'] = function() {
    this._aureliaSubscriptionCount = (this._aureliaSubscriptionCount || 0) + 1
    if (!this._aureliaSubscription)
      this._aureliaSubscription = this.subscribe(change => {
        if (this._value !== change.value) {
          this._value = change.value
        }
        console.log('change', change, this)
        // if (this['_contextChange']) {
        //   this['_contextChange'](change)
        // }
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
    return this._value
  } as (() => any) & { dependencies: Array<string> }
  getter.dependencies = ['_value']

  if (typeof subject.next === 'function')
    Object.defineProperty(subject, 'value', {
      get: getter,
      set: function(newValue) {
        if (newValue !== this._value) {
          const value = { value: newValue, origin: ChangeOrigin.View, type: BindingType.Value }
          this.next(value)
          
          if (this['_contextChange'])
            this['_contextChange'](value)
        }
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
    
  subject['_bindingType'] = BindingType.Value
}

export function collection<T>() {
  const subject = new Subject() as Collection<T>
  subject.value = new Array()
  subject['_bindingType'] = BindingType.Collection
  subject['_unbind'] = function() {
    const subscriptions = (this._collectionSubscriptions as Set<Subscription>)
    if (subscriptions) {
      subscriptions.forEach(subscription => subscription.unsubscribe())
      subscriptions.clear()
    }
  }
  return subject
}

/**
 * dummy value converter that allows to synchronize
 * retriggering of a binding to changes of other values
 */
export class TriggerValueConverter {
  toView(source) {
    return source
  }
}

export function configure(frameworkConfig: FrameworkConfiguration) {
  const viewResources = frameworkConfig.aurelia.resources
  const valueConverterInstance = frameworkConfig.container.get(TriggerValueConverter)
  viewResources.registerValueConverter('trigger', valueConverterInstance)
  // viewResources.registerBindingBehavior('trigger', bindingBehaviorInstance)
  
  const hooks = {
    beforeBind: function (view: View & {bindingContext}) {
      const context = view.bindingContext
      if (!context || typeof context.cycle !== 'function') return
      // console.log('before bind', view)
      
      const sources = context.cycleDrivers || {}
      const { drivers, observables } = makeBindingDrivers(context)
      
      // bind all observables
      Object.getOwnPropertyNames(observables)
        .forEach(propName => {
          if (typeof observables[propName]._bind === 'function')
            observables[propName]._bind()
        })
      
      context._cycleContextObservables = observables
      
      Object.assign(sources, drivers)
      
      const disposeFunction = Cycle.run(context.cycle.bind(context), sources)
      
      context._cycleDispose = disposeFunction
    },
    beforeUnbind: function (view: View & {bindingContext}) {
      const context = view.bindingContext
      if (!context || typeof context.cycle !== 'function') return
      
      const observables = context._cycleContextObservables
      Object.getOwnPropertyNames(observables)
        .forEach(propName => {
          if (typeof observables[propName]._unbind === 'function')
            observables[propName]._unbind()
        })
      
      context._cycleDispose()   
    },
  } as ViewEngineHooks
  
  viewResources.registerViewEngineHooks(hooks)
}
