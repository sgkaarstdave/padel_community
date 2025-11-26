const getElement = (id) => document.getElementById(id);

const elements = {
  get eventsList() {
    return getElement('eventsList');
  },
  get eventsHistory() {
    return getElement('eventsHistory');
  },
  get mySessionsList() {
    return getElement('mySessionsList');
  },
  get myAppointmentsList() {
    return getElement('myAppointmentsList');
  },
  get ownerAlerts() {
    return getElement('ownerAlerts');
  },
  get calendarGrid() {
    return getElement('calendarGrid');
  },
  get calendarRange() {
    return getElement('calendarRange');
  },
  get skillFilter() {
    return getElement('skillFilter');
  },
  get locationFilter() {
    return getElement('locationFilter');
  },
  get joinableOnlyFilter() {
    return getElement('joinableOnlyFilter');
  },
  get activeMatches() {
    return getElement('activeMatches');
  },
  get openSpots() {
    return getElement('openSpots');
  },
  get communityTrend() {
    return getElement('communityTrend');
  },
};

export { elements };
