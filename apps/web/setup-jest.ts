import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv({
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true,
});

/**
 * jsdom does not implement the native <dialog> modal methods, which the
 * confirmation dialog relies on (the browser's own focus trap and Escape
 * handling are exactly why the component uses <dialog> rather than a
 * hand-rolled overlay).
 *
 * This is a TEST-ONLY shim: it makes showModal/close observable in jsdom and
 * keeps `open` consistent, so specs can assert on dialog behaviour. The
 * application code is unchanged.
 */
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, returnValue?: string) {
    this.open = false;
    if (returnValue !== undefined) {
      this.returnValue = returnValue;
    }
    this.dispatchEvent(new Event('close'));
  };
}
