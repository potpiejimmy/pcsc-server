/* Constructor */
function Notifier() {
    this.observers = {};
}

Notifier.prototype.addObserver = function(key, observer) {
  if (!(key in this.observers)) this.observers[key] = [];
  this.observers[key].push(observer);
}

Notifier.prototype.notifyObservers = function(key, arg) {
  if (key in this.observers) {
    this.observers[key].forEach(function(element) {
      element(arg);
    });
    delete this.observers[key];
  }
}

Notifier.prototype.getObservers = function(key) {
  return this.observers[key];
}

module.exports = Notifier;
