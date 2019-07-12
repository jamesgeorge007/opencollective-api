import { expect } from 'chai';

/* Support code */
import * as libpayments from '../server/lib/payments';

/* Test tools */
import * as utils from './utils';
import * as store from './features/support/stores';

const getCollectiveQuery = `
query Collective($slug: String) {
  Collective(slug: $slug) {
    members {
      id
      role
      member {
        id
        slug
        name
        createdByUser {
          id
          email
          firstName
          lastName
        }
      }
    }
    transactions {
      id
      description
      createdByUser {
        id
        email
        firstName
        lastName
      }
    }
    orders {
      id
      description
      totalAmount
      createdByUser {
        id
        email
        firstName
        lastName
      }
      fromCollective {
        slug
        name
        createdByUser {
          id
          email
          firstName
          lastName
        }
      }
    }
  }
}`;

describe('grahpql.createOrder.opencollective', () => {
  let adminUser, backerUser, user, anonymousCollective, hostCollective, collective, hostAdmin;

  before(async () => {
    await utils.resetTestDB();
    ({ user: adminUser } = await store.newUser('new admin user', { firstName: 'admin', lastName: 'user' }));
    ({ user: backerUser } = await store.newUser('new backerUser', { firstName: 'backer', lastName: 'user' }));
    ({ user } = await store.newUser('new user', { firstName: 'u', lastName: 'ser' }));
    anonymousCollective = await store.newAnonymousProfile(user);
    ({ hostCollective, collective, hostAdmin } = await store.newCollectiveWithHost('test', 'USD', 'USD', 10));
    await collective.addUserWithRole(adminUser, 'ADMIN');
    await collective.addUserWithRole(backerUser, 'BACKER');
  }); /* End of "beforeEach" */

  describe('making an anonymous donation ', async () => {
    before(async () => {
      // Given the following order with a payment method
      const { order } = await store.newOrder({
        from: anonymousCollective,
        to: collective,
        amount: 2000,
        currency: 'USD',
        paymentMethodData: {
          customerId: 'new-user',
          service: 'opencollective',
          type: 'prepaid',
          initialBalance: 10000,
          currency: 'USD',
          data: { HostCollectiveId: hostCollective.id },
        },
      });

      // When the above order is executed; Then the transaction
      // should be unsuccessful.
      await libpayments.executeOrder(user, order);
    });

    it("doesn't leak anonymous info when querying the api not logged in", async () => {
      const res = await utils.graphqlQuery(getCollectiveQuery, {
        slug: collective.slug,
      });
      res.errors && console.error(res.errors[0]);
      expect(res.errors).to.not.exist;
      const collectiveData = res.data.Collective;
      expect(collectiveData.orders[0].createdByUser.firstName).to.be.null;
      expect(collectiveData.orders[0].createdByUser.lastName).to.be.null;
      expect(collectiveData.orders[0].createdByUser.email).to.be.null;
      expect(collectiveData.orders[0].fromCollective.name).to.equal('anonymous');
      expect(collectiveData.orders[0].fromCollective.createdByUser.firstName).to.be.null;
      expect(collectiveData.orders[0].fromCollective.createdByUser.lastName).to.be.null;
      expect(collectiveData.orders[0].fromCollective.createdByUser.email).to.be.null;
      expect(collectiveData.orders[0].fromCollective.createdByUser.firstName).to.be.null;
      expect(collectiveData.members[0].member.createdByUser.firstName).to.equal('admin');
      expect(collectiveData.members[1].member.createdByUser.firstName).to.equal('backer');
      expect(collectiveData.members[2].member.slug).to.be.null;
      expect(collectiveData.members[2].member.createdByUser.firstName).to.be.null;
      expect(collectiveData.members[2].member.createdByUser.email).to.be.null;
      expect(collectiveData.members[3].member.createdByUser.firstName).to.equal('host');
      expect(collectiveData.transactions[0].createdByUser.firstName).to.be.null;
      expect(collectiveData.transactions[0].createdByUser.lastName).to.be.null;
      expect(collectiveData.transactions[0].createdByUser.email).to.be.null;
    });

    it("doesn't leak anonymous info when querying the api logged in as another backer", async () => {
      const res = await utils.graphqlQuery(
        getCollectiveQuery,
        {
          slug: collective.slug,
        },
        backerUser,
      );
      res.errors && console.error(res.errors[0]);
      expect(res.errors).to.not.exist;
      const collectiveData = res.data.Collective;
      expect(collectiveData.orders[0].createdByUser.firstName).to.be.null;
      expect(collectiveData.orders[0].createdByUser.lastName).to.be.null;
      expect(collectiveData.orders[0].createdByUser.email).to.be.null;
      expect(collectiveData.orders[0].fromCollective.name).to.equal('anonymous');
      expect(collectiveData.orders[0].fromCollective.createdByUser.firstName).to.be.null;
      expect(collectiveData.orders[0].fromCollective.createdByUser.lastName).to.be.null;
      expect(collectiveData.orders[0].fromCollective.createdByUser.email).to.be.null;

      expect(collectiveData.members[0].member.createdByUser.firstName).to.equal('admin');
      expect(collectiveData.members[1].member.createdByUser.firstName).to.equal('backer');
      expect(collectiveData.members[2].member.slug).to.be.null;
      expect(collectiveData.members[2].member.createdByUser.firstName).to.be.null;
      expect(collectiveData.members[2].member.createdByUser.email).to.be.null;
      expect(collectiveData.members[3].member.createdByUser.firstName).to.equal('host');
      expect(collectiveData.transactions[0].createdByUser.firstName).to.be.null;
      expect(collectiveData.transactions[0].createdByUser.lastName).to.be.null;
      expect(collectiveData.transactions[0].createdByUser.email).to.be.null;
    });

    it('expose anonymous slug to the owner of the anonymous collective', async () => {
      const res = await utils.graphqlQuery(
        getCollectiveQuery,
        {
          slug: collective.slug,
        },
        user,
      );
      res.errors && console.error(res.errors[0]);
      expect(res.errors).to.not.exist;
      const collectiveData = res.data.Collective;
      expect(collectiveData.members[2].member.slug).to.not.be.null;
    });

    it('expose anonymous email to the collective admin', async () => {
      const res = await utils.graphqlQuery(
        getCollectiveQuery,
        {
          slug: collective.slug,
        },
        adminUser,
      );
      res.errors && console.error(res.errors[0]);
      expect(res.errors).to.not.exist;
      const collectiveData = res.data.Collective;
      expect(collectiveData.orders[0].createdByUser.firstName).to.equal('u');
      expect(collectiveData.orders[0].createdByUser.lastName).to.equal('ser');
      expect(collectiveData.orders[0].createdByUser.email).to.equal(user.email);
      expect(collectiveData.orders[0].fromCollective.name).to.equal('anonymous');
      expect(collectiveData.orders[0].fromCollective.createdByUser.firstName).to.equal('u');
      expect(collectiveData.orders[0].fromCollective.createdByUser.lastName).to.equal('ser');
      expect(collectiveData.orders[0].fromCollective.createdByUser.email).to.equal(user.email);
      expect(collectiveData.members[0].member.createdByUser.firstName).to.equal('admin');
      expect(collectiveData.members[1].member.createdByUser.firstName).to.equal('backer');
      expect(collectiveData.members[2].member.slug).to.be.null;
      expect(collectiveData.members[2].member.createdByUser.firstName).to.equal('u');
      expect(collectiveData.members[2].member.createdByUser.lastName).to.equal('ser');
      expect(collectiveData.members[2].member.createdByUser.email).to.equal(user.email);
      expect(collectiveData.members[3].member.createdByUser.firstName).to.equal('host');
      expect(collectiveData.transactions[0].createdByUser.firstName).to.equal('u');
      expect(collectiveData.transactions[0].createdByUser.lastName).to.equal('ser');
      expect(collectiveData.transactions[0].createdByUser.email).to.equal(user.email);
    });

    it('expose anonymous email to the host admin', async () => {
      const res = await utils.graphqlQuery(
        getCollectiveQuery,
        {
          slug: collective.slug,
        },
        hostAdmin,
      );
      res.errors && console.error(res.errors[0]);
      expect(res.errors).to.not.exist;
      const collectiveData = res.data.Collective;
      expect(collectiveData.orders[0].createdByUser.firstName).to.equal('u');
      expect(collectiveData.orders[0].createdByUser.lastName).to.equal('ser');
      expect(collectiveData.orders[0].createdByUser.email).to.equal(user.email);
      expect(collectiveData.orders[0].fromCollective.name).to.equal('anonymous');
      expect(collectiveData.orders[0].fromCollective.createdByUser.firstName).to.equal('u');
      expect(collectiveData.orders[0].fromCollective.createdByUser.lastName).to.equal('ser');
      expect(collectiveData.orders[0].fromCollective.createdByUser.email).to.equal(user.email);
      expect(collectiveData.members[0].member.createdByUser.firstName).to.equal('admin');
      expect(collectiveData.members[1].member.createdByUser.firstName).to.equal('backer');
      expect(collectiveData.members[2].member.slug).to.be.null;
      expect(collectiveData.members[2].member.createdByUser.firstName).to.equal('u');
      expect(collectiveData.members[2].member.createdByUser.lastName).to.equal('ser');
      expect(collectiveData.members[2].member.createdByUser.email).to.equal(user.email);
      expect(collectiveData.members[3].member.createdByUser.firstName).to.equal('host');
      expect(collectiveData.transactions[0].createdByUser.firstName).to.equal('u');
      expect(collectiveData.transactions[0].createdByUser.lastName).to.equal('ser');
      expect(collectiveData.transactions[0].createdByUser.email).to.equal(user.email);
    });
  });
});
