import winston from "winston";

winston.add(new winston.transports.Console());

import MongoUnit from 'mongo-unit';
import { UserDatabase } from "../../src/database/UserDatabase";
import { Db, MongoClient, ObjectId } from 'mongodb';
import { UserMessage } from "@uems/uemscommlib";
import ReadUserMessage = UserMessage.ReadUserMessage;
import DeleteUserMessage = UserMessage.DeleteUserMessage;
import UpdateUserMessage = UserMessage.UpdateUserMessage;
import CreateUserMessage = UserMessage.CreateUserMessage;
import bind from "../../src/Binding";
import { BindingBroker, makeBindingBroker } from "../utilities/BindingBroker";

jest.setTimeout(20000);

const initData = [
    {
        _id: new ObjectId("56d9bf92f9be48771d6fe5b1"),
        email: "email one",
        name: "name one",
        uid: "uid one",
        username: "username one",
    }, {
        _id: new ObjectId("56d9bf92f9be48771d6fe5b2"),
        email: "email two",
        name: "name two",
        uid: "uid two",
        username: "username two",
    }, {
        _id: new ObjectId("56d9bf92f9be48771d6fe5b3"),
        email: "email three",
        name: "name three",
        uid: "uid three",
        username: "username three",
    }
];


describe('executing query messages query the proper entities', () => {

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
        await db.collection('details').createIndex({ name: 'text', username: 'text' });

        database = new UserDatabase(db, {
            details: 'details',
            changelog: 'changelog',
        });

        broker = new BindingBroker();
        // @ts-ignore - this is based on the actual code so may need reviewing on change
        bind(database, broker);
    });

    afterAll(() => {
        // Shutdown our connection to the database
        client.close();

        // Then stop the in memory database
        MongoUnit.stop();
    });

    // Before we begin each test we'll reset the database to make sure that we start on a clean slate
    beforeEach(async () => {
        await db.collection('details').insertMany(initData);
    });

    afterEach(async () => {
        await db.collection('details').deleteMany({});
        await MongoUnit.drop();
    })

    it('query does not include email by default', async (done) => {
        broker.emit('query', {
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
        }, (message) => {
            expect(message).toHaveProperty('result');
            expect(message).toHaveProperty('status');

            expect(message.result).toHaveLength(3);
            expect(message.result).toEqual([{
                name: "name one",
                id: "uid one",
                username: "username one",
            }, {
                name: "name two",
                id: "uid two",
                username: "username two",
            }, {
                name: "name three",
                id: "uid three",
                username: "username three",
            }]);

            expect(message.status).toEqual(200);
            done();
        }, 'user.details.read');
    })

    it('query includes email on request', async (done) => {
        broker.emit('query', {
            msg_intention: "READ",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            includeEmail: true,
        }, (message) => {
            expect(message).toHaveProperty('result');
            expect(message).toHaveProperty('status');

            expect(message.result).toHaveLength(3);
            expect(message.result).toEqual([{
                name: "name one",
                id: "uid one",
                username: "username one",
                email: 'email one',
            }, {
                name: "name two",
                id: "uid two",
                username: "username two",
                email: 'email two',
            }, {
                name: "name three",
                id: "uid three",
                username: "username three",
                email: 'email three',
            }]);

            expect(message.status).toEqual(200);
            done();
        }, 'user.details.read');
    })

    it('queries only return internal user properties', async (done) => {
        broker.emit('query', {
            msg_intention: "READ",  
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            includeEmail: true,
        }, (message) => {
            expect(message).toHaveProperty('result');
            expect(message).toHaveProperty('status');

            expect(message.result).toHaveLength(3);
            expect(message.status).toEqual(200);

            const allowed = ['email', 'username', 'name', 'id', 'profile'];
            for (const entry of message.result) {
                for (const key of Object.keys(entry)) {
                    expect(allowed).toContain(key);
                }
            }

            done();
        }, 'user.details.read');
    })


});
