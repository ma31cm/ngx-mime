import { browser, element, by } from 'protractor';

describe('Mime E2E Tests', function () {

  beforeEach(() => browser.get(''));

  it('should display lib', () => {
    expect(element(by.css('h2')).getText()).toEqual('mime works!');
  });

});