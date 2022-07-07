import winston from "winston";

winston.add(new winston.transports.Console());

import MongoUnit from 'mongo-unit';
import { UserDatabase } from "../../src/database/UserDatabase";
import { Db, MongoClient, ObjectId } from 'mongodb';
import { BindingBroker } from "../utilities/BindingBroker";
import bind from "../../src/Binding";
import { MsgStatus, UserMessage } from "@uems/uemscommlib";
import CreateUserMessage = UserMessage.CreateUserMessage;

jest.setTimeout(20000);

describe('executing create messages create the proper entities', () => {

    let client: MongoClient;
    let db: Db;
    let database: UserDatabase;
    let broker: BindingBroker;

    beforeAll(async () => {
        // Setup the in memory mongo db database
        await MongoUnit.start();

        // Create the database connection and connect to the one we just created in memory
        client = new MongoClient(MongoUnit.getUrl(), {
            useUnifiedTopology: true,
        });
        await client.connect();

        // Then create a user database around this
        db = client.db('testing');
        database = new UserDatabase(db, {
            details: 'details',
            changelog: 'changelog',
        });

        broker = new BindingBroker();
    });

    afterAll(() => {
        // Shutdown our connection to the database
        client.close();

        // Then stop the in memory database
        MongoUnit.stop();
    });

    beforeEach(async () => {
        await db.collection('details').insertOne({
            _id: new ObjectId("56d9bf92f9be48771d6fe5b1"),
            email: "duplicated email",
            hash: "duplicated hash",
            name: "duplicated name",
            uid: "duplicated uid",
            username: "duplicated username",
        });
        // @ts-ignore - this is based on the actual code so may need reviewing on change
        bind(database, broker);
    });

    // Before we begin each test we'll reset the database to make sure that we start on a clean slate
    afterEach(() => Promise.allSettled([
        db.collection('details').deleteMany({}),
        db.collection('changelog').deleteMany({}),
        broker.clear(),
    ]));

    it('basic create should succeed', async (done) => {
        broker.emit('create', {
            msg_intention: "CREATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'id',
            name: 'name',
            username: 'username',
            profile: 'profile',
            email: 'email',
        }, (message) => {
            expect(message).toHaveProperty('result');
            expect(message).toHaveProperty('status');

            expect(message.status).toEqual(MsgStatus.SUCCESS);
            expect(message.result).toHaveLength(1);
            expect(message.result[0]).toEqual('id');

            done();
        });
    });

    it('creating with an existing ID will fail', async (done) => {
        broker.emit('create', {
            msg_intention: "CREATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            hash: 'hash',
            email: 'email',
            username: 'username',
            name: 'name',
            id: 'duplicated uid',
            profile: 'profile',
        } as CreateUserMessage, (message) => {
            expect(message).toHaveProperty('result');
            expect(message).toHaveProperty('status');

            expect(message.result).toHaveLength(1);
            expect(message.status).toEqual(MsgStatus.FAIL);
            expect(message.result[0]).toEqual('user ID already claimed');

            done();
        });
    });

    it('creating with an existing email will fail', async (done) => {
        broker.emit('create', {
            msg_intention: "CREATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            hash: 'hash',
            email: 'duplicated email',
            username: 'username',
            name: 'name',
            id: 'new id which is not included',
            profile: 'profile',
        } as CreateUserMessage, (message) => {
            expect(message).toHaveProperty('result');
            expect(message).toHaveProperty('status');

            expect(message.result).toHaveLength(1);
            expect(message.status).toEqual(MsgStatus.FAIL);
            expect(message.result[0]).toEqual('email already claimed');

            done();
        });
    });

    it('creating with an existing username will fail', async (done) => {
        broker.emit('create', {
            msg_intention: "CREATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            hash: 'hash',
            email: 'email',
            username: 'duplicated username',
            name: 'name',
            id: 'new id which is not included',
            profile: 'profile',
        } as CreateUserMessage, (message) => {
            expect(message).toHaveProperty('result');
            expect(message).toHaveProperty('status');

            expect(message.result).toHaveLength(1);
            expect(message.status).toEqual(MsgStatus.FAIL);
            expect(message.result[0]).toEqual('username already claimed');

            done();
        });
    });

    it('create should fail smoothly if database is invalid', (done) => {
        broker.clear();
        // @ts-ignore - this shouldn't happen but its worth testing this case just to be sure
        bind(undefined, broker);
        broker.emit('create', {
            msg_intention: "CREATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            hash: 'hash',
            email: 'email',
            username: 'username',
            name: 'name',
            id: 'new id which is not included',
            profile: 'profile',
        } as CreateUserMessage, (message) => {
            expect(message).toHaveProperty('result');
            expect(message).toHaveProperty('status');

            expect(message.result).toHaveLength(1);
            expect(message.status).toEqual(MsgStatus.FAIL);
            expect(message.result[0]).toEqual('service is not ready');

            done();
        });
    });
});
