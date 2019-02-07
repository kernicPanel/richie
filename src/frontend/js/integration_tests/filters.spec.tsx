import '../testSetup';

import { mount, ReactWrapper } from 'enzyme';
import fetchMock from 'fetch-mock';
import * as React from 'react';
import { Provider } from 'react-redux';
import { Store } from 'redux';

import { bootstrapStore } from '../bootstrap';
import { SearchFilter } from '../components/SearchFilter/SearchFilter';
import { SearchFilterGroupContainer } from '../components/SearchFilterGroupContainer/SearchFilterGroupContainer';
import { SearchFiltersPane } from '../components/SearchFiltersPane/SearchFiltersPane';
import { addMultipleResources } from '../data/genericReducers/resourceById/actions';
import { didGetResourceList } from '../data/genericSideEffects/getResourceList/actions';
import { RootState } from '../data/rootReducer';
import { modelName } from '../types/models';

describe('Integration tests - filters', () => {
  let store: Store<RootState>;
  let makeSearchFilterPane: () => ReactWrapper;
  const mockHistoryPushState = jest.spyOn(window.history, 'pushState');

  beforeEach(() => {
    mockHistoryPushState.mockReset();

    // Create the store with the same initial state as in-app
    store = bootstrapStore();
    // Create some organizations, categories and courses facets and put them in our store so we can
    // use them to test the filters
    const orgs = [
      {
        id: 3,
        logo: null,
        title: 'Organization Three',
      },
      {
        id: 4,
        logo: null,
        title: 'Organization Four',
      },
      {
        id: 5,
        logo: null,
        title: 'Organization Five',
      },
    ];
    store.dispatch(addMultipleResources(modelName.ORGANIZATIONS, orgs));
    store.dispatch(
      didGetResourceList(
        modelName.ORGANIZATIONS,
        {
          meta: { limit: 3, offset: 0, total_count: 3 },
          objects: orgs,
        },
        { limit: 0, offset: 3 },
      ),
    );
    const categories = [
      { id: 31, image: null, title: 'Category Thirty-One' },
      { id: 41, image: null, title: 'Category Forty-One' },
      { id: 51, image: null, title: 'Category Fifty-One' },
    ];
    store.dispatch(addMultipleResources(modelName.CATEGORIES, categories));
    store.dispatch(
      didGetResourceList(
        modelName.CATEGORIES,
        {
          meta: { limit: 3, offset: 0, total_count: 3 },
          objects: categories,
        },
        { limit: 0, offset: 3 },
      ),
    );
    store.dispatch(
      didGetResourceList(
        modelName.COURSES,
        {
          facets: {
            categories: { 31: 1, 41: 3, 51: 9 },
            organizations: { 3: 12, 4: 87, 5: 56 },
          },
          meta: { limit: 0, offset: 0, total_count: 400 },
          objects: [],
        },
        { limit: 0, offset: 0 },
      ),
    );
    // Mount our whole filters pane whhenever we need it.
    makeSearchFilterPane = () =>
      mount(
        <Provider store={store}>
          <SearchFiltersPane />
        </Provider>,
      );
  });

  afterEach(() => {
    fetchMock.restore();
  });

  it('shows the values for the hardcoded filters in their groups', () => {
    const filterGroupNew = makeSearchFilterPane()
      .find(SearchFilterGroupContainer)
      .filterWhere(wrapper => wrapper.prop('machineName') === 'new');
    expect(filterGroupNew.html()).toContain('search-filter');
    expect(filterGroupNew.html()).toContain('First session');
  });

  it('shows the values for the resource-based filters in their groups, ordered by facet count', () => {
    const filtersOrganizations = makeSearchFilterPane()
      .find(SearchFilterGroupContainer)
      .filterWhere(
        wrapper => wrapper.prop('machineName') === modelName.ORGANIZATIONS,
      )
      .find(SearchFilter);
    expect(filtersOrganizations.at(0).html()).toContain('Organization Four');
    expect(filtersOrganizations.at(0).html()).toContain('87');
    expect(filtersOrganizations.at(1).html()).toContain('Organization Five');
    expect(filtersOrganizations.at(1).html()).toContain('56');
    expect(filtersOrganizations.at(2).html()).toContain('Organization Three');
    expect(filtersOrganizations.at(2).html()).toContain('12');
  });

  it('adds the value to the relevant filter when the user clicks on a filter value', async () => {
    // Return the same thing as what's already in state, we don't intend to modify the state
    fetchMock.get('/api/v1.0/courses/?limit=0&offset=0&organizations=5', {
      facets: {
        categories: { 31: 1, 41: 3, 51: 9 },
        organizations: { 3: 12, 4: 87, 5: 56 },
      },
      meta: { limit: 0, offset: 0, total_count: 400 },
      objects: [],
    });

    // Simulate a click on the filter we wish to add
    makeSearchFilterPane()
      .find(SearchFilter)
      .filterWhere(
        wrapper => wrapper.html().indexOf('Organization Five') !== -1,
      )
      .simulate('click');

    // Flush all promises (let data from our fetchMock reach the store)
    await new Promise(resolve => setImmediate(resolve));

    // Our newly active filter should be at the top
    const topOrgsFilter = makeSearchFilterPane()
      .find(SearchFilterGroupContainer)
      .filterWhere(
        wrapper => wrapper.prop('machineName') === modelName.ORGANIZATIONS,
      )
      .find(SearchFilter)
      .first();

    // The correct filter is at the top and marked as active
    expect(topOrgsFilter.html()).toContain('Organization Five');
    expect(topOrgsFilter.find('button').hasClass('active')).toBeTruthy();

    // URL has been updated with the filter
    expect(window.history.pushState).toHaveBeenCalledWith(
      null,
      '',
      '?limit=0&offset=0&organizations=5',
    );
  });

  it('removes the filter value when the user clicks on an active filter', async () => {
    // Return the same thing as what's already in state, we don't intend to modify the state
    fetchMock.get('/api/v1.0/courses/?limit=0&offset=0', {
      facets: {
        categories: { 31: 1, 41: 3, 51: 9 },
        organizations: { 3: 12, 4: 87, 5: 56 },
      },
      meta: { limit: 0, offset: 0, total_count: 400 },
      objects: [],
      params: { limit: 0, offset: 0, categories: '41' },
    });

    // Set the categories filter to '41'
    store.dispatch(
      didGetResourceList(
        modelName.COURSES,
        {
          facets: {
            categories: { 31: 1, 41: 3, 51: 9 },
            organizations: { 3: 12, 4: 87, 5: 56 },
          },
          meta: { limit: 0, offset: 0, total_count: 400 },
          objects: [],
        },
        { limit: 0, offset: 0, categories: '41' },
      ),
    );

    // Ensure the value is active before we go on to disable it
    expect(
      makeSearchFilterPane()
        .find(SearchFilter)
        .filterWhere(wrapper => wrapper.find('button').hasClass('active'))
        .html(),
    ).toContain('Category Forty-One');

    // Simulate a click on the filter we want to disable
    makeSearchFilterPane()
      .find(SearchFilter)
      .filterWhere(
        wrapper => wrapper.html().indexOf('Category Forty-One') !== -1,
      )
      .simulate('click');

    // Flush all promises (let data from our fetchMock reach the store)
    await new Promise(resolve => setImmediate(resolve));

    // Our previously active filter is not at the top, instead it is the filter with the highest facet count
    expect(
      makeSearchFilterPane()
        .find(SearchFilterGroupContainer)
        .filterWhere(
          wrapper => wrapper.prop('machineName') === modelName.CATEGORIES,
        )
        .find(SearchFilter)
        .first()
        .html(),
    ).toContain('Category Fifty-One');

    // Our previously active filter is not marked as active any more
    expect(
      makeSearchFilterPane()
        .find(SearchFilter)
        .filterWhere(
          wrapper => wrapper.html().indexOf('Category Forty-One') !== -1,
        )
        .find('button')
        .hasClass('active'),
    ).not.toBeTruthy();

    // URL has been updated to remove the filter
    expect(window.history.pushState).toHaveBeenCalledWith(
      null,
      '',
      '?limit=0&offset=0',
    );
  });
});