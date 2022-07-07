import winston from "winston";

winston.add(new winston.transports.Console());

import MongoUnit from 'mongo-unit';
import { UserDatabase } from "../../src/database/UserDatabase";
import { Db, MongoClient, ObjectId } from 'mongodb';
import { BindingBroker } from "../utilities/BindingBroker";
import bind from "../../src/Binding";

jest.setTimeout(20000);

const initData = [
    {
        _id: new ObjectId("56d9bf92f9be48771d6fe5b1"),
        email: "email one",
        name: "name one",
        uid: "uid one",
        username: "username one",
    }
];

describe('executing assert messages asserts the proper entities', () => {

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
        await db.collection('details').insertMany(initData);
        // @ts-ignore - this is based on the actual code so may need reviewing on change
        bind(database, broker);
    });

    afterEach(async () => {
        await db.collection('details').deleteMany({});
        await MongoUnit.drop();
        broker.clear();
    })

    it('asserting existing user updates', (done) => {
        const sendFunc = jest.fn();
        broker.emit('any', {
            msg_intention: "ASSERT",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid one',
            email: 'asserted email',
            name: 'asserted name',
            username: 'asserted username',
        }, sendFunc);

        setTimeout(() => {
            expect(sendFunc).not.toHaveBeenCalled();
            done();
        }, 2000);
    });

});
