import { reminderDisplaySegments, reminderMentionNames } from '../logic/reminderMentions';

describe('reminderMentionNames', () => {
  it('always includes the assignee and creator, then the directory, without duplicates or blanks', () => {
    expect(reminderMentionNames({ forName: 'Anubhav Maurya', byName: 'Afshin Dhanani' }, ['Afshin Dhanani', ' Faiz Patel ', '', null, undefined]))
      .toEqual(['Anubhav Maurya', 'Afshin Dhanani', 'Faiz Patel']);
  });
  it('copes with a record that carries no names', () => {
    expect(reminderMentionNames({})).toEqual([]);
  });
});

describe('reminderDisplaySegments', () => {
  const names = ['Anubhav Maurya', 'Shehzad Tejani', 'Farhan Aga'];

  it('drops the @ from a known mention and keeps the rest verbatim', () => {
    expect(reminderDisplaySegments('@Anubhav Maurya Ticket System for CRM Issue.', names)).toEqual([
      { text: 'Anubhav Maurya', mention: true },
      { text: ' Ticket System for CRM Issue.', mention: false },
    ]);
  });
  it('handles several mentions in one sentence', () => {
    expect(reminderDisplaySegments('@Shehzad Tejani @Farhan Aga Road Map Kenya Branch', names)).toEqual([
      { text: 'Shehzad Tejani', mention: true },
      { text: ' ', mention: false },
      { text: 'Farhan Aga', mention: true },
      { text: ' Road Map Kenya Branch', mention: false },
    ]);
  });
  it('leaves an unknown @word and an email address exactly as typed', () => {
    expect(reminderDisplaySegments('ping @someone at anu@kingsgroupco.com', names)).toEqual([
      { text: 'ping @someone at anu@kingsgroupco.com', mention: false },
    ]);
  });
  it('returns the plain text when there is nothing to match', () => {
    expect(reminderDisplaySegments('Warehouse discussion', [])).toEqual([{ text: 'Warehouse discussion', mention: false }]);
  });
});
