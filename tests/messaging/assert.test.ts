import winston from "winston";

winston.add(new winston.transports.Console());

import MongoUnit from 'mongo-unit';
import { UserDatabase } from "../../src/database/UserDatabase";
import { Db, MongoClient, ObjectId } from 'mongodb';

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

    it('asserting existing user updates', async () => {
        const results = await database.assert({
            msg_intention: "ASSERT",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid one',
            email: 'asserted email',
            name: 'asserted name',
            username: 'asserted username',
        });

        const query = await database.query({
            msg_id: 0,
            status: 0,
            userID: 'anonymous',
            msg_intention: 'READ',
        });


        await expect(query).toHaveLength(1);
        await expect(query).toEqual([
            {
                name: "asserted name",
                id: "uid one",
                username: "asserted username",
            }
        ]);
    });

    it('asserting new user creates entry', async () => {
        const results = await database.assert({
            msg_intention: "ASSERT",
            userID: 'anonymous',
            status: 0,
            msg_id: 0,
            id: 'uid three',
            username: 'username three',
            name: 'name three',
            email: 'email three',
        });

        const query = await database.query({
            msg_id: 0,
            status: 0,
            userID: 'anonymous',
            msg_intention: 'READ',
        });

        await expect(query).toHaveLength(2);
        await expect(query).toEqual([
            {
                name: "name one",
                id: "uid one",
                username: "username one",
            }, {
                name: "name three",
                id: "uid three",
                username: "username three",
            }
        ]);
    });

});
