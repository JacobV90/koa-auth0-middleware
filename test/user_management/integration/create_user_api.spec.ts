/* tslint:disable:max-line-length*/
/* tslint:disable:ter-prefer-arrow-callback*/

import 'mocha';
import { expect } from 'chai';
import * as request from 'supertest';
import * as Koa from 'koa';
import { AddBeforeHookDataToUser } from '../../../src/common/types';
import { HttpError } from 'http-errors';
import * as sinon from 'sinon';
import { randomEmail, randomPassword, AuthConnections } from '../../helpers/';
import { CreateUserApi } from '../../../src/user_management/api';
import { UserManagementController } from '../../../src/user_management';
import { Auth0 } from '../../../src/common/auth0';
import * as bodyParser from 'koa-bodyparser';

const config = require('../../../config.json').auth0;

describe('create_user_api.spec.ts', function () {
  this.timeout(5000);

  describe('Create User Api', function () {

    let app: Koa;
    let server: any;
    let createUserApi: CreateUserApi;
    let userController: UserManagementController;
    const userOneEmail: string = randomEmail();

    before(() => {
      app = new Koa();
      userController = new UserManagementController(new Auth0(config));
      createUserApi = new CreateUserApi(userController);
      app.use(bodyParser());
      app.use(createUserApi.getRouter());
      server = app.listen(3000);
    });

    after(async () => {
      await server.close();
    });

    it('should create a new user provided valid parameters', function (done) {
      request(server)
      .post('/users')
      .send({
        email: userOneEmail,
        password: randomPassword(),
        connection: AuthConnections.defaultConnection,
      })
      .then(async (response) => {
        expect(response.status).to.equal(200);
        expect(response.body.email).to.equal(userOneEmail);
        expect(response.body.user_id).to.not.be.undefined;

        await userController.deleteUser({ id: response.body.user_id });
        done();
      });
    });

    it('should NOT create a new user provided an invalid email', function (done) {
      const invalidEmail: string = 'notvalid';
      request(server)
      .post('/users')
      .send({
        email: invalidEmail,
        password: randomPassword(),
        connection: AuthConnections.defaultConnection,
      })
      .then((response) => {
        expect(response.status).to.equal(400);
        expect(response.text).to.equal('Payload validation error: \'Object didn\'t pass validation for format email: ' +
          invalidEmail + '\' on property email (The user\'s email).');
        expect(response.body.email).to.be.undefined;
        expect(response.body.user_id).to.be.undefined;
        done();
      });
    });

    it('should NOT create a new user provided a password that does not meet strength requirements', function (done) {
      request(server)
      .post('/users')
      .send({
        email: userOneEmail,
        password: 'test',
        connection: AuthConnections.defaultConnection,
      })
      .then((response) => {
        expect(response.status).to.equal(400);
        expect(response.text).to.equal('PasswordStrengthError: Password is too weak');
        expect(response.body.email).to.be.undefined;
        expect(response.body.user_id).to.be.undefined;
        done();
      });
    });

    it('should NOT create a new user provided no parameters', function (done) {
      request(server)
      .post('/users')
      .send({})
      .then((response) => {
        expect(response.status).to.equal(400);
        expect(response.text).to.equal('request body is empty');
        expect(response.body.email).to.be.undefined;
        expect(response.body.user_id).to.be.undefined;
        done();
      });
    });
  });

  describe('Create User Api w/Hooks', () => {

    let app: Koa;
    let createUserApi: CreateUserApi;
    let userController: UserManagementController;
    let server: any;
    const userTwoEmail: string = randomEmail();
    const userThreeEmail: string = randomEmail();
    const userFourEmail: string = randomEmail();

    it('should create a new user provided valid parameters and attach all properties from the "beforeResult" object ', async function () {
      // SETUP
      const beforeHookData: AddBeforeHookDataToUser = {
        attachToUser: true,
        data: {
          test: 'test',
        },
      };

      const beforeHook = async (): Promise<AddBeforeHookDataToUser> => {
        return beforeHookData;
      };

      const afterHook = async (ctx: Koa.Context): Promise<void> => {
        expect(ctx.state.beforeHookData.data.test).to.equal('test');
        ctx.body = ctx.state.data;
      };

      const beforeHookSpy: sinon.SinonSpy = sinon.spy(beforeHook);

      app = new Koa();
      userController = new UserManagementController(new Auth0(config));
      createUserApi = new CreateUserApi(userController);
      createUserApi.beforeInvoke = beforeHookSpy;
      createUserApi.afterInvoke = afterHook;
      app.use(bodyParser());
      app.use(createUserApi.getRouter());
      server = app.listen(3000);
      // END SETUP

      const response = await request(server)
      .post('/users')
      .send({
        email: userTwoEmail,
        password: randomPassword(),
        connection: AuthConnections.defaultConnection,
      });

      expect(beforeHookSpy.returned(Promise.resolve(beforeHookData))).to.be.true;
      expect(response.status).to.equal(200);
      expect(response.body.email).to.equal(userTwoEmail);
      expect(response.body.user_id).to.not.be.undefined;
      expect(response.body.user_metadata.test).to.equal('test');

      await userController.deleteUser({ id: response.body.user_id });
      await server.close();
    });

    it('should create a new user provided valid parameters and attach some properties from the "beforeResult" object', async function () {
      // SETUP
      const beforeHook = async (): Promise<AddBeforeHookDataToUser> => {
        return {
          attachToUser: true,
          propsToAdd: ['address', 'married', 'mothersMaidenName', 'friends', 'age'],
          data: {
            age: 27,
            address: {
              state: 'Iowa',
              street: 'random',
              zip: '52246',
            },
            married: false,
            mothersMaidenName: 'Smith',
            friends: ['Jeremy', 'Chelsea', 'Alyssa', 'Max'],
            access: {
              token: 'test token',
              expiration: 4800,
            },
          },
        };
      };

      const afterHook = async (ctx: Koa.Context): Promise<void> => {
        expect(ctx.state.beforeHookData.data.access.token).to.equal('test token');
        expect(ctx.state.beforeHookData.data.access.expiration).to.equal(4800);
        ctx.body = ctx.state.data;
      };

      app = new Koa();
      userController = new UserManagementController(new Auth0(config));
      createUserApi = new CreateUserApi(userController);
      createUserApi.beforeInvoke = beforeHook;
      createUserApi.afterInvoke = afterHook;
      app.use(bodyParser());
      app.use(createUserApi.getRouter());

      server = app.listen(3000);
      // END SETUP

      const response = await request(server)
      .post('/users')
      .send({
        email: userThreeEmail,
        password: randomPassword(),
        connection: AuthConnections.defaultConnection,
        user_metadata: {
          middleName: 'marie',
        },
      });

      expect(response.status).to.equal(200);
      expect(response.body.email).to.equal(userThreeEmail);
      expect(response.body.user_id).to.not.be.undefined;
      expect(response.body.user_metadata.middleName).to.equal('marie');
      expect(response.body.user_metadata.address.street).to.equal('random');
      expect(response.body.user_metadata.address.state).to.equal('Iowa');
      expect(response.body.user_metadata.address.zip).to.equal('52246');
      expect(response.body.user_metadata.age).to.equal(27);
      expect(response.body.user_metadata.married).to.equal(false);
      expect(response.body.user_metadata.mothersMaidenName).to.equal('Smith');
      expect(response.body.user_metadata.friends[0]).to.equal('Jeremy');
      expect(response.body.user_metadata.friends.length).to.equal(4);
      expect(response.body.user_metadata.access).to.be.undefined;

      await userController.deleteUser({ id: response.body.user_id });
      await server.close();
    });

    it('should create a new user provided valid parameters and not attach any properties from the "beforeResult" object ', async function () {
      // SETUP
      const beforeHook = async (): Promise<AddBeforeHookDataToUser> => {
        return {
          data: {
            token: 'test token',
          },
        };
      };

      const afterHook = async (ctx: Koa.Context): Promise<void> => {
        expect(ctx.state.beforeHookData.data.token).to.equal('test token');
        ctx.body = ctx.state.data;
      };

      app = new Koa();
      userController = new UserManagementController(new Auth0(config));
      createUserApi = new CreateUserApi(userController);
      createUserApi.beforeInvoke = beforeHook;
      createUserApi.afterInvoke = afterHook;
      app.use(bodyParser());
      app.use(createUserApi.getRouter());

      server = app.listen(3000);
      // END SETUP

      const response = await request(server)
      .post('/users')
      .send({
        email: userFourEmail,
        password: 'testPassword123',
        connection: AuthConnections.defaultConnection,
      });

      expect(response.status).to.equal(200);
      expect(response.body.email).to.equal(userFourEmail);
      expect(response.body.user_id).to.not.be.undefined;
      expect(response.body.user_metadata).to.be.undefined;

      await userController.deleteUser({ id: response.body.user_id });
      await server.close();
    });
  });

  describe('Create User Api w/Custom Error Handler', () => {

    it('should NOT create a new user provided an invalid email and response with a custom error message', async function () {
      // setup
      const errorHandler = async (ctx: Koa.Context, error: HttpError): Promise<void> => {
        error.message = 'email is not in a valid format';
        ctx.throw(error.statusCode, error);
      };
      const email: string = 'not valid';
      const password: string = 'testPassword123';

      const app = new Koa();
      const userController = new UserManagementController(new Auth0(config));
      const createUserApi = new CreateUserApi(userController);
      createUserApi.errorHandler = errorHandler;
      app.use(bodyParser());
      app.use(createUserApi.getRouter());

      const server = app.listen(3000);
      // end setup

      const response = await request(server)
      .post('/users')
      .send({
        email,
        password,
        connection: AuthConnections.defaultConnection,
      });

      expect(response.status).to.equal(400);
      expect(response.text).to.equal('email is not in a valid format');
      expect(response.body.email).to.be.undefined;
      expect(response.body.user_id).to.be.undefined;

      await server.close();
    });
  });
});
