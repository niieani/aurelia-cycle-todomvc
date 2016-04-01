import {View} from 'aurelia-templating'
import {Observable, Observer, Subscription, BehaviorSubject, ReplaySubject, Subject} from 'rxjs/Rx'

import Cycle from './core' // '@cycle/core' // /lib/index
import rxjsAdapter from '@cycle/rxjs-adapter' // /lib/index
import { DriverFunction } from '@cycle/base'
import {LogManager, FrameworkConfiguration, declarePropertyDependencies, computedFrom, autoinject} from 'aurelia-framework';
import {BindingSignaler} from 'aurelia-templating-resources'

import {ViewEngineHooks} from 'aurelia-templating'

export {Observable, Observer, Subscription, BehaviorSubject, ReplaySubject, Subject} from 'rxjs/Rx'

// for ObservableSignalBindingBehavior
import {Binding, sourceContext, ObserverLocator} from 'aurelia-binding'

export class BindingType {
  static Value = 'value'
  static Action = 'action'
  static Collection = 'collection'
  static Context = 'context'
}

export class ChangeType {
  static Value = 'value'
  static Action = 'action'
  static Added = 'added'
  static Removed = 'removed'
  static Bind = 'bind'
  static Unbind = 'unbind'
}

export class ChangeOrigin {
  static View = 'View'
  static ViewModel = 'ViewModel'
  static InitialValue = 'InitialValue'
}

export interface BindingChange<T> {
  now: T;
  origin: ChangeOrigin;
  type: ChangeType;
}

export interface ContextChanges extends BindingChange<any> {
  property: string;
}

export interface CollectionChanges<T> extends ContextChanges {
  item: T;
}

export interface CollectionChange<T> {
  action: 'added' | 'removed';
  item: T & { changes$: Observable<ContextChanges> };
}

export type CycleValue<T> = Observable<T> & { now?: T };

export type ValueAndOrigin<T> = {now: T, origin: ChangeOrigin}

export type Collection<T> = Subject<CollectionChanges<T>> & { now: Array<T> }

export interface CycleDriverContext {
  changes$: Subject<ContextChanges>;
}

export function makeBindingDrivers(context) {
  const drivers = {}
  const observables = {}
  
  // mega-observable
  let changes$: Subject<ContextChanges> = context.changes$ || new Subject<ContextChanges>()
  changes$['_bindingType'] = BindingType.Context
  
  context._onBindHook = function() {
    changes$.next({ 
      property: null, 
      origin: ChangeOrigin.ViewModel, 
      now: null, 
      type: ChangeType.Bind
    })
  }
  context._onUnbindHook = function() {
    changes$.next({ 
      property: null, 
      origin: ChangeOrigin.ViewModel, 
      now: null, 
      type: ChangeType.Unbind
    })
    if (typeof this._postUnbindHook === 'function')
      this._postUnbindHook()
  }
  /*
  const originalBind = context.constructor.prototype.bind as Function
  // if (!originalBind)
  //   context.constructor.prototype.bind = function() {}
  
  context.bind = function bind() {
    // console.log('binding')
    if (originalBind)
      originalBind.apply(this, arguments)
    changes$.next({ 
      property: null, 
      origin: ChangeOrigin.ViewModel, 
      now: null, 
      type: ChangeType.Bind
    })
  }
  
  const originalUnbind = context.constructor.prototype.unbind as Function
  // if (!originalUnbind)
  //   context.constructor.prototype.unbind = function() {}

  context.unbind = function unbind() {
    // console.log('unbinding')
    if (originalUnbind)
      originalUnbind.apply(this, arguments)
    changes$.next({ 
      property: null, 
      origin: ChangeOrigin.ViewModel, 
      now: null, 
      type: ChangeType.Unbind
    })
    if (typeof this._postUnbindHook === 'function')
      this._postUnbindHook()
  }
  */
  
  Object.keys(context)
    .filter(propName => typeof context[propName].subscribe === 'function')
    .forEach(propName => {
      const observable = context[propName] as BehaviorSubject<any> & { _bindingType; _now }
      
      // if (typeof observable.next === 'function') {
      observable['_contextChangesTrigger'] = (change: BindingChange<any>) => 
        changes$.next({ property: propName, now: change.now, origin: change.origin, type: change.type })
      
      /*
      if (observable instanceof BehaviorSubject) {
        // initial value
        const currentValue = observable.getValue()
        const change = Object.assign({}, currentValue, { origin: ChangeOrigin.InitialValue })
        if (currentValue !== undefined)
          observable['_contextChangesTrigger'](change)
        // const tempSub = observable.subscribe(change => observable['_contextChangesTrigger'](change))
      }
      */
      
      // }
      // 
      // if (!context._cycleChangesMerged) {
      //   changes$
      //   observable
      //     .map(change => ({ property: propName, now: change.now, origin: change.origin }))
      //   // changes$ = changes$.merge(observable.map(change => ({ property: propName, now: change.now, origin: change.origin })))
      // }
      
      observables[propName] = observable
      
      switch (observable._bindingType) {
        case BindingType.Action:
          // enhanceSubjectWithAureliaAction(observable)
          drivers[propName] = makeActionBindingDriver(observable) //makeOneWayBindingDriver(observable)
          break
        case BindingType.Collection:
          drivers[propName] = makeCollectionBindingDriver(observable)
          break
        case BindingType.Context:
          drivers[propName] = makeContextDriver(observable)
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
  if (!context.changes$) {
    context.changes$ = changes$
    // context._cycleChangesMerged = true
    // drivers['changes$'] = makeOneWayBindingDriver(changes$)
  }
  return { drivers, observables }
}

export function makeTwoWayBindingDriver(bindingObservable: BehaviorSubject<any> & { _now?: any }) {
  const driverCreator: DriverFunction = function aureliaDriver(value$: Observable<string>) {
    value$.subscribe(newValueFromContext => {
      if (newValueFromContext !== bindingObservable._now) {
        const next = { now: newValueFromContext, origin: ChangeOrigin.ViewModel, type: ChangeType.Value }
        bindingObservable.next(next)
      
        if (bindingObservable['_contextChangesTrigger'])
          bindingObservable['_contextChangesTrigger'](next)
      }
    })

    return bindingObservable
      .filter(change => change !== undefined)
      // .filter(change => change !== undefined && change.origin === ChangeOrigin.View)
      .map(change => change.now)
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function makeActionBindingDriver(bindingObservable: Subject<any>) {
  const driverCreator: DriverFunction = function aureliaDriver(triggers$: Observable<string>) {
    triggers$.subscribe(args => {
      const next = { now: args, origin: ChangeOrigin.ViewModel, type: ChangeType.Action }
      // const next = { now: newValueFromContext, origin: ChangeOrigin.ViewModel, type: ChangeType.Value }
      bindingObservable.next(next)
    
      if (bindingObservable['_contextChangesTrigger'])
        bindingObservable['_contextChangesTrigger'](next)
    })

    return bindingObservable
      .filter(change => change !== undefined)
      // .filter(change => change !== undefined && change.origin === ChangeOrigin.View)
      .map(change => change.now)
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function makeContextDriver(contextObservable: Subject<ContextChanges>) {
  const driverCreator: DriverFunction = function aureliaDriver() {
    // return {
    //   property(property: string) {
    //     return contextObservable.filter(change => change.property === property)
    //   },
    // }
    return contextObservable.asObservable()
    // return contextObservable
    //   .filter(change => change !== undefined)
    //   // .filter(change => change !== undefined && change.origin === ChangeOrigin.View)
    //   .map(change => change.now)
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function makeOneWayBindingDriver(bindingObservable: Observable<any> & { _now?: any }) {
  const driverCreator: DriverFunction = function aureliaDriver() {
    return bindingObservable
      .filter(change => change !== undefined)
      // .filter(change => change !== undefined && change.origin === ChangeOrigin.View)
      .map(change => change.now)
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function makeCollectionBindingDriver(collectionObservable: Observable<CollectionChange<{}>> & { now?: Array<any> }) {
  const driverCreator: DriverFunction = function collectionDriver(collectionChanges$: Subject<CollectionChange<{}>>) {
    const allInternalChanges$ = new Subject<CollectionChanges<{}>>()
    const contextChangeTrigger = collectionObservable['_contextChangesTrigger']
    const subscriptionMap = new WeakMap<any, Subscription>()
    // const array = new Array()
    const array = collectionObservable.now
    const subscriptions = new Set<Subscription>()
    collectionObservable['_collectionSubscriptions'] = subscriptions
    
    collectionChanges$.subscribe(collectionChange => {
      // console.log('collection change', collectionChange)
      if (collectionChange.action == 'added') {
        if (array.indexOf(collectionChange.item) >= 0) return

        array.push(collectionChange.item)
        if (!collectionChange.item.changes$) {
          collectionChange.item.changes$ = new Subject<ContextChanges>()
        }
        const subscription = collectionChange.item.changes$.subscribe(change => {
          const next = { item: collectionChange.item, property: change.property, origin: change.origin, now: change.now, type: change.type } 
          allInternalChanges$.next(next)
          if (contextChangeTrigger) {
            contextChangeTrigger(next)
          }
        })
        subscriptionMap.set(
          collectionChange.item, 
          subscription
        )
        subscriptions.add(subscription)
      }
      else {
        const index = array.indexOf(collectionChange.item)
        if (array.indexOf(collectionChange.item) < 0) return
        
        collectionChange.item['_postUnbindHook'] = () => {
          // console.log('unsubscribing post-unbind')
          const subscription = subscriptionMap.get(collectionChange.item)
          if (subscription) {
            subscription.unsubscribe()
            subscriptions.delete(subscription)
          }
        }
        
        array.splice(array.indexOf(collectionChange.item), 1)
      }
      
      allInternalChanges$.next({ 
        item: collectionChange.item, 
        property: null, 
        origin: ChangeOrigin.ViewModel, 
        now: null, 
        type: collectionChange.action === 'added' ? ChangeType.Added : ChangeType.Removed 
      })
    })
    return allInternalChanges$
    
    /**
     * mass trigger - always trigger callables of a certain name
     * i.e.
     * title, completed =>
     * context.changes$.next({ property, name, origin })
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
    const next = { origin: ChangeOrigin.View, now: Array.from(arguments), type: ChangeType.Action }
    subject.next(next)
    
    if (subject['_contextChangesTrigger'])
      subject['_contextChangesTrigger'](next)
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
  const next = { now: initialValue, origin: ChangeOrigin.View, type: ChangeType.Value }
  let subject: any = initialValue === undefined ? new ReplaySubject<any>(1) : new BehaviorSubject<any>(next)
  enhanceSubjectWithAureliaValue(subject)
  subject._now = initialValue
  // if (initialValue !== undefined) {
  //   subject.next(value)
  //   // subject = subject.startWith(value)
    
  //   // if (subject['_contextChangesTrigger'])
  //   //   subject['_contextChangesTrigger'](value)
      
  //   // else
  //   //   subject['_replyForContext'] = value
  //   // subject.next(initialValue)
  // }
  
  // we're cheating a bit with types
  return subject as CycleValue<T>
}

function enhanceSubjectWithAureliaValue<T>(subject: BehaviorSubject<ValueAndOrigin<T>>, initialValue?: T) {
  if (subject['_bindingType'] !== undefined) return

  subject['_bind'] = function() {
    this._aureliaSubscriptionCount = (this._aureliaSubscriptionCount || 0) + 1
    if (!this._aureliaSubscription)
      this._aureliaSubscription = this.subscribe(change => {
        // this._now = change.now
        
        if (change !== undefined && this._now !== change.now && !(change.origin === ChangeOrigin.View && change.now === undefined)) {
          this._now = change.now
          // console.log('change', change, this)
          // if (change.now instanceof Object) {
          // }
        }
        
        // if (this['_contextChangesTrigger']) {
        //   this['_contextChangesTrigger'](change)
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
    // console.log('getting value', this)
    return this._now
  } as (() => any) & { dependencies: Array<string> }
  getter.dependencies = ['_now']

  if (typeof subject.next === 'function')
    Object.defineProperty(subject, 'now', {
      get: getter.bind(subject),
      set: function(newValue) {
        if (newValue !== this._now) {
          const next = { now: newValue, origin: ChangeOrigin.View, type: ChangeType.Value }
          this.next(next)
          
          if (this['_contextChangesTrigger'])
            this['_contextChangesTrigger'](next)
        }
      },
      enumerable: true,
      configurable: true
    })
  else
    Object.defineProperty(subject, 'now', {
      get: getter.bind(subject),
      enumerable: true,
      configurable: true
    })
    
  subject['_bindingType'] = BindingType.Value
}

export function collection<T>() {
  const subject = new Subject() as Collection<T>
  subject.now = new Array()
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
  
  const originalBind = View.prototype.bind
  View.prototype.bind = function bind(bindingContext, overrideContext, _systemUpdate) {
    const wasBound = this.isBound
    originalBind.apply(this, arguments)
    
    if (!wasBound) {
      this.resources._invokeHook('afterBind', this);
    }
  }
  
  const originalUnbind = View.prototype.unbind
  View.prototype.unbind = function unbind() {
    const wasBound = this.isBound
    const bindingContext = this.bindingContext
    originalUnbind.apply(this, arguments)
    
    if (wasBound) {
      this.resources._invokeHook('afterUnbind', bindingContext);
    }
  }
  
  const hooks = {
    beforeBind: function (view: View & {bindingContext}) {
      const context = view.bindingContext
      if (!context || typeof context.cycle !== 'function') return
      // console.log('before bind', view)
      
      // TODO add count
      
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
      
      if (typeof context._onBindHook === 'function')
        context._onBindHook()
    },
    beforeUnbind: function (view: View & {bindingContext}) {
      const context = view.bindingContext
      if (!context || typeof context.cycle !== 'function') return
      
      const observables = context._cycleContextObservables
      Object.getOwnPropertyNames(observables)
        .forEach(propName => {
          const observable = observables[propName]
          
          /*
          if (observable['_contextChangesTrigger'] && observable instanceof BehaviorSubject) {
            const change = Object.assign({ origin: ChangeOrigin.InitialValue })
            observable['_contextChangesTrigger'](change)
          }
          */
          
          if (typeof observable._unbind === 'function')
            observable._unbind()
        })
      
      context._cycleDispose()
      
      if (typeof context._onUnbindHook === 'function')
        context._onUnbindHook()      
    },
    // afterBind: function (view: View & {bindingContext}) {
    //   const context = view.bindingContext
    //   console.log('afterBind')
    //   context._onBindHook()
    // },
    // afterUnbind: function (context) {
    //   console.log('afterUnbind')
    //   context._onUnbindHook()
    // }
  } as ViewEngineHooks
  
  viewResources.registerViewEngineHooks(hooks)
}
