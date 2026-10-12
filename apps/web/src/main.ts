import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {
  // Nothing has rendered yet at this point, so the console is the only channel.
  console.error('Failed to start the application', error);
});
