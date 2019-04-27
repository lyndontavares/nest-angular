import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { FrontendMiddleware } from 'middlewares/frontend.middleware';
import { MongoRepoModule } from 'mongo-nest';
import { EventsModule } from './webRTC/events.module';
import { App1Module } from './app1/app1.module';
import { MacroModule } from './macro/macro.module';
import { AppController } from './app.controller';
import { ExpressSessionMiddleware } from '@nest-middlewares/express-session';
import { PassportInitializeMiddleware, PassportSessionMiddleware } from '@nest-middlewares/passport';
import { HelmetMiddleware } from '@nest-middlewares/helmet';
@Module({
  imports: [AuthModule, AdminModule, App1Module, MacroModule,
    MongoRepoModule.forRoot('mongodb://localhost:27017'),
    EventsModule],
  // controllers: [AppController],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(FrontendMiddleware).forRoutes('*');

    // IMPORTANT! Call Middleware.configure BEFORE using it for routes
    //HelmetMiddleware.configure({
    //});
   // consumer.apply(ExpressSessionMiddleware).forRoutes('*');
  //   consumer
  //     .apply(PassportInitializeMiddleware)
  //     .forRoutes('*')
  //     .apply(PassportSessionMiddleware)
  //     .forRoutes('*');
   }
}
