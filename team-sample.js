/* =============================================================
   TEMPLATE ONLY — sample team for the Meet the team page
   -------------------------------------------------------------
   Shown on a home's Meet the team page (clearly labelled "Example")
   until real staff at that home are switched on in the staff hub
   (Our team → Home teams). These people are not real. Delete this
   file and its use in server.js once every home has its real team.
   ============================================================= */

const team = [
  { name: 'Daniel Okafor', title: 'Deputy Manager', department: 'Senior care', startYear: 2017, loveLine: 'Seeing a new resident settle in and finally call this place home.' },
  { name: 'Sarah Mitchell', title: 'Care Team Leader', department: 'Care', startYear: 2015, loveLine: 'The laughs at breakfast. Every single morning.' },
  { name: 'Mark Fletcher', title: 'Head Chef', department: 'Kitchen', startYear: 2014, loveLine: 'Cooking someone’s favourite dish from 1965 and getting it right.' },
  { name: 'Megan Price', title: 'Activities Coordinator', department: 'Activities', startYear: 2019, loveLine: 'Friday tea dances — the whole lounge sings along.' },
  { name: 'Priya Nair', title: 'Senior Carer', department: 'Senior care', startYear: 2020, loveLine: 'Having time to really listen, not just do the round.' },
  { name: 'Amina Bello', title: 'Dementia Care Lead', department: 'Care', startYear: 2016, loveLine: 'Finding the song or photo that brings someone back for a moment.' },
  { name: 'Halina Kowalska', title: 'Head Housekeeper', department: 'Housekeeping', startYear: 2013, loveLine: 'Fresh flowers in every room on a Monday.' },
  { name: 'Claire Dawson', title: 'Home Administrator', department: 'Admin', startYear: 2016, loveLine: 'Being the first friendly voice families hear on the phone.' },
  { name: 'Tomasz Nowak', title: 'Night Senior Carer', department: 'Senior care', startYear: 2018, loveLine: 'The calm of nights — a hot drink and a chat when someone can’t sleep.' },
  { name: 'Jordan Hughes', title: 'Care Assistant', department: 'Care', startYear: 2022, loveLine: 'Residents’ stories. I’ve learnt more here than at school.' },
  { name: 'Ben Thornton', title: 'Wellbeing Assistant', department: 'Activities', startYear: 2023, loveLine: 'Garden club, and growing tomatoes with Arthur.' },
  { name: 'Joanne Reid', title: 'Kitchen Assistant', department: 'Kitchen', startYear: 2020, loveLine: 'Baking day. The smell gets everyone talking.' },
  { name: 'Lucy Barker', title: 'Care Assistant', department: 'Care', startYear: 2021, loveLine: 'Doing nails and hair before family visits.' },
  { name: 'Ryan Cooke', title: 'Maintenance Lead', department: 'Housekeeping', startYear: 2018, loveLine: 'Fixing things the same day so nobody has to wait.' },
];

const manager = {
  name: 'Grace Holloway',
  title: 'Home Manager',
  chips: ['Registered Manager', '18 years in care', 'Dementia Champion', 'Manager since 2019'],
};

// The sample welcome letter, using the home's name and the manager's first name.
function letter(homeName, first) {
  return [
    'Choosing a care home is one of the biggest decisions you’ll make, and it’s rarely an easy one. You don’t have to make it alone — we’ll answer every question, however small.',
    homeName + ' is a busy, cheerful home. You’ll hear music from the lounge, smell baking on a Thursday, and meet a team who’ve mostly been here for years. We know our residents’ stories, and we treat them like family.',
    'The best way to know if ' + homeName + ' is right is to see it. Pop in for a cup of tea — I’d love to show you round myself.',
  ].join('\n\n') + (first ? '' : '');
}

module.exports = { team, manager, letter };
