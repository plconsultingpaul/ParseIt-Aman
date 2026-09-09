const handleNavigate = (page: 'extract' | 'vendor' | 'orders' | 'transform' | 'types' | 'settings' | 'logs') => {
  if (page === 'settings' && !user.isAdmin) {
    alert('You do not have permission to access settings.');
    return;
  }
  if ((page === 'types' || page === 'logs' || page === 'settings' || page === 'transform' || page === 'extract') && user.role === 'vendor') {
    alert('You do not have permission to access this section.');
    return;
  }
  if (page === 'orders' && user.role !== 'vendor') {
    alert('This page is only available for vendor accounts.');
    return;
  }
  setCurrentPage(page);
};