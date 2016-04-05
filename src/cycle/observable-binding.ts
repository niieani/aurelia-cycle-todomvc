/**
 * TODO: observable binding support
 */
  // const observables = new Set<any>()
  // Object.keys(context)
  //   // .filter(propName => typeof context[propName].subscribe === 'function')
  //   .forEach(propName => {
  //     const triggerContextChange = (change: BindingChange<any>) => 
  //         changes$.next({ property: propName, now: change.now, origin: change.origin, type: change.type })

  //     if (context[propName] instanceof Observable) {
  //       const observable = context[propName] as BehaviorSubject<any> & { _bindingType; _now }
        
  //       observable['_contextChangesTrigger'] = triggerContextChange
        
  //       /*
  //       if (observable instanceof BehaviorSubject) {
  //         // emit initial value
  //         const currentValue = observable.getValue()
  //         const change = Object.assign({}, currentValue, { origin: ChangeOrigin.InitialValue })
  //         if (currentValue !== undefined)
  //           observable['_contextChangesTrigger'](change)
  //         // const tempSub = observable.subscribe(change => observable['_contextChangesTrigger'](change))
  //       }
  //       */
        
  //       observables.add(observable)
  //       // observables[propName] = observable
        
  //       switch (observable._bindingType) {
  //         case BindingType.Action:
  //           // enhanceSubjectWithAureliaAction(observable)
  //           drivers[propName] = makeActionBindingDriver(observable) //makeOneWayBindingDriver(observable)
  //           break
  //         case BindingType.Collection:
  //           drivers[propName] = makeCollectionBindingDriver(observable)
  //           break
  //         case BindingType.Context:
  //           drivers[propName] = makeContextDriver(observable)
  //           break
  //         case undefined:
  //           enhanceSubjectWithAureliaValue(observable)
  //           // NOTE: fallthrough intentional!
  //         default:
  //           drivers[propName] = typeof observable.next === 'function' ? 
  //                 makeTwoWayBindingDriver(observable) : makeOneWayBindingDriver(observable)
  //       }
  //     } else {
  //       const value = drivers[propName]
  //       const strategy = strategyLocator.getStrategy(value)
  //       // if (!strategy || strategy instanceof NullRepeatStrategy) {
  //         // non-repeatable
  //         const aureliaObserver = observerLocator.getObserver(context, propName)
  //         let { driverCreator, dispose } = makeContextPropertyDriver(aureliaObserver, triggerContextChange)
  //         drivers[`${propName}$`] = driverCreator
  //         disposeMethods.add(dispose)
  //       // } else {
  //       //   console.log('strategy', strategy)
  //       //   const aureliaCollectionObserver = strategy.getCollectionObserver(observerLocator, value) //as ModifyCollectionObserver
  //       //   let { driverCreator, dispose } = makeContextPropertyCollectionDriver(aureliaCollectionObserver, triggerContextChange)
  //       //   drivers[`${propName}$`] = driverCreator
  //       //   disposeMethods.add(dispose)          
  //       // }
  //       // if (drivers[propName] instanceof Array)
  //       // drivers[propName] = make
  //     }
  //   }
  //   // TODO: add setter drivers on non-observable properties
  //   // use the observer from Aurelia to convert the values to Observables
  // )
// old stuff
/*
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
      .asObservable()
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
      .asObservable()
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
        
        if (collectionChange.item instanceof Object) { 
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
      }
      else {
        const index = array.indexOf(collectionChange.item)
        if (array.indexOf(collectionChange.item) < 0) return
        
        if (collectionChange.item instanceof Object) {
          function _postUnbindHook() {
            console.log('unsubscribing post-unbind')
            const subscription = subscriptionMap.get(collectionChange.item)
            if (subscription) {
              subscription.unsubscribe()
              subscriptions.delete(subscription)
            }
          }
          collectionChange.item['_postUnbindHooks'] = collectionChange.item['_postUnbindHooks'] || []
          collectionChange.item['_postUnbindHooks'].push(_postUnbindHook)
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
    return allInternalChanges$.asObservable()
    
    
    //  * mass trigger - always trigger callables of a certain name
    //  * i.e.
    //  * title, completed =>
    //  * context.changes$.next({ property, name, origin })
     
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
*/

/**
 * dummy value converter that allows to synchronize
 * retriggering of a binding to changes of other values
 */
export class TriggerValueConverter {
  toView(source) {
    return source
  }
}
