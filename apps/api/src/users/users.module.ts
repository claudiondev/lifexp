import { Module } from '@nestjs/common';
import { authThrottler } from '../auth/throttler.js';
import { AccountService } from './account.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [authThrottler],
  controllers: [UsersController],
  providers: [UsersService, AccountService],
})
export class UsersModule {}
