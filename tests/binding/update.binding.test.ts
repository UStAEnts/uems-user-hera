import winston from "winston";

winston.add(new winston.transports.Console());

import MongoUnit from 'mongo-unit';
import { UserDatabase } from "../../src/database/UserDatabase";
import { Db, MongoClient, ObjectId } from 'mongodb';
import { BindingBroker } from "../utilities/BindingBroker";
import bind from "../../src/Binding";
import { MsgStatus } from "@uems/uemscommlib";

jest.setTimeout(20000);

describe('executing delete messages delete the proper entities', () => {

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

    // Before we begin each test we'll reset the database to make sure that we start on a clean slate
    beforeEach(async () => {
        await db.collection('details').insertMany([
            {
                _id: new ObjectId("56d9bf92f9be48771d6fe5b1"),
                email: "email one",
                hash: "hash",
                name: "name",
                uid: "uid1",
                username: "username one",
            }, {
                _id: new ObjectId("56d9bf92f9be48771d6fe5b2"),
                email: "email two",
                hash: "hash",
                name: "name",
                uid: "uid2",
                username: "username two",
            }, {
                _id: new ObjectId("56d9bf92f9be48771d6fe5b3"),
                email: "email three",
                hash: "hash",
                name: "name",
                uid: "uid3",
                username: "username three",
            }
        ]);
        // @ts-ignore - this is based on the actual code so may need reviewing on change
        bind(database, broker);
    });

    afterEach(async () => {
        await db.collection('details').deleteMany({});
        await MongoUnit.drop();
        broker.clear();
    })

    it('basic update should succeed', (done) => {
        broker.emit('update', {
            msg_intention: "UPDATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid1',

            email: 'new email',
            name: 'new name',
            profile: 'new profile',
            username: 'new username',
        }, (message) => {
            expect(message).toHaveProperty('result');
            expect(message).toHaveProperty('status');

            expect(message.status).toEqual(MsgStatus.SUCCESS);
            expect(message.result).toHaveLength(1);
            expect(message.result[0]).toEqual('uid1');

            done();
        });
    });

    it('updating with the ObjectID should not work', (done) => {
        broker.emit('update', {
            msg_intention: "UPDATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: '56d9bf92f9be48771d6fe5b2',
            username: 'new username',
        }, (message) => {
            expect(message).toHaveProperty('result');
            expect(message).toHaveProperty('status');

            expect(message.status).toEqual(MsgStatus.FAIL);
            expect(message.result).toHaveLength(1);
            expect(message.result[0]).toEqual('invalid user ID');

            done();
        });

    })

    it('updating invalid ID should not work', (done) => {
        broker.emit('update', {
            msg_intention: "UPDATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid4',
            username: 'new username',
        }, (message) => {
            expect(message).toHaveProperty('result');
            expect(message).toHaveProperty('status');

            expect(message.status).toEqual(MsgStatus.FAIL);
            expect(message.result).toHaveLength(1);
            expect(message.result[0]).toEqual('invalid user ID');

            done();
        });
    });

    it('updating with no changes should not work', (done) => {
        broker.emit('update', {
            msg_intention: "UPDATE",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid4',
        }, (message) => {
            expect(message).toHaveProperty('result');
            expect(message).toHaveProperty('status');

            expect(message.status).toEqual(MsgStatus.FAIL);
            expect(message.result).toHaveLength(1);
            expect(message.result[0]).toEqual('no operations provided');

            done();
        });
    });
});
