const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { user: null, page: 'dashboard', language: localStorage.getItem('language') || 'en', search: '', busFilters: { route_id: '', status: '' }, bankView: { from: '', to: '', bank_id: '' }, owners: [], buses: [], routes: [], funds: [], members: [] };

const words = {
  en: {
    brand: 'Bus Malik Somiti', workspace: 'ASSOCIATION WORKSPACE', offline: 'Offline ready', logout: 'Sign out',
    dashboard: 'Dashboard', owners: 'Bus Owners', buses: 'Buses', routes: 'Routes',
    members: 'Members', cashbook: 'Cashbook', reports: 'Reports',
    users: 'Users & Permissions', settings: 'Settings & Backup', totalBuses: 'Total Buses',
    totalActiveBuses: 'Total Active Buses', totalInactiveBuses: 'Total Inactive Buses', totalOwners: 'Bus Owners',
    totalRoutes: 'Routes', totalMembers: 'Members', funds: 'Funds',
    today: "Today's Collection", month: 'Monthly Collection',
    fundBalance: 'Total Fund Balance', expenses: 'Total Expenses', monthlyExpenses: 'Monthly Expenses',
    recent: 'Recent Transactions', fundsSummary: 'Fund Balances', add: 'Add New', search: 'Search records...',
    busListSearch: 'Search bus no, owner, mobile or route...',
    actions: 'Actions', edit: 'Edit', delete: 'Delete', save: 'Save', cancel: 'Cancel', noRows: 'No records found.',
    name: 'Name', mobile: 'Mobile Number', address: 'Address', nominee_name: 'Nominee Name', father_name: "Father's Name",
    photo_path: 'Photograph', route_number: 'Route Number', starting_point: 'Starting Point', destination: 'Destination',
    charge_bdt: 'Route Charge (BDT)', description: 'Description', registration_number: 'Bus Registration Number',
    owner_id: 'Bus Owner', route_id: 'Route', driver_name: 'Driver Name', driver_mobile: 'Driver Mobile',
    bus_type: 'Bus Type', helper_name: 'Helper Name', status: 'Status', join_date: 'Joining Date',
    membership_date: 'Membership Date', member_type: 'Member Type', monthly_fee_bdt: 'Monthly Fee (BDT)',
    opening_balance_bdt: 'Opening Balance (BDT)', is_active: 'Active', date: 'Date', bus_id: 'Bus',
    fund_id: 'Fund', receiver_name: 'Received By', reference_number: 'Reference Number',
    transaction_type: 'Transaction Type', category: 'Category', amount_bdt: 'Amount (BDT)', member_id: 'Member',
    description_label: 'Description', from_fund_id: 'From Fund', to_fund_id: 'To Fund',
    exportPdf: 'Export PDF',
    exportExcel: 'Export Excel', from: 'From Date', to: 'To Date', ledger: 'Transaction History',
    addIncome: 'Add Income', addExpense: 'Add Expense', transfer: 'Fund Transfer', backup: 'Backup Database',
    restore: 'Restore Database', changePassword: 'Change Password', username: 'Username', full_name: 'Full Name',
    password: 'Password (min 8 characters)', role: 'Role', administrator: 'Administrator', staff: 'Staff',
    login: 'Sign in', setup: 'Create administrator account', signInPrompt: 'Sign in to manage association operations.',
    setupPrompt: 'First-time setup: create your administrator account.', current_password: 'Current password',
    new_password: 'New password', transactions: 'Transactions',
    loading: 'Loading...', owner_code: 'Owner ID', member_code: 'Member ID', total: 'Total',
    confirmDelete: 'Delete this record? This may be blocked if related financial records exist.',
    saved: 'Saved successfully.', paymentSaved: 'Payment recorded and receipt generated.',
    noPermission: 'You do not have permission to perform this action.',
    reportType: 'Report Type', receipt: 'Receipt',
    appSettings: 'Association Setup', setupHint: 'Change your password, manage local database backups, and configure staff accounts.',
    userHint: 'Only administrators can add users and configure staff access.',
    modal: 'Record details', invalid: 'Please check the required fields.',
    active: 'Active', inactive: 'Inactive', close: 'Close',
    transferDone: 'Fund transfer recorded.', backupDone: 'Database backup saved.', restoreDone: 'Database restored. Sign in again.',
    passwordChanged: 'Password changed.', selectFund: 'Select fund', selectOwner: 'Select owner',
    selectRoute: 'Select route', selectBus: 'Select bus', selectMember: 'Select member',
    amountWords: 'All amounts are stored as integer poisha.',
    typeIncome: 'Income', typeExpense: 'Expense', other: 'Other', starting: 'Start date',
    account: 'Account', printOwner: 'Print Owner Info', permissions: 'Permissions', activityLog: 'Activity Log',
    loginHistory: 'Login History', disable: 'Disable', enable: 'Enable', showReport: 'Show Report',
    dailyCollection: 'Daily Collection', monthlyCollection: 'Monthly Collection', yearlyCollection: 'Yearly Collection',
    busWiseReport: 'Bus-wise Report', ownerWiseReport: 'Owner-wise Report', routeWiseReport: 'Route-wise Report',
    busStatusReport: 'Bus Status Report', allRoutes: 'All Routes', allStatuses: 'All Statuses',
    activeOnly: 'Active Only', inactiveOnly: 'Inactive Only', searchByBusNumber: 'Search by bus number...',
    busStatusListReport: 'Route-wise Bus List', routeBuses: 'Buses on this route',
    routeBusHint: 'Buses registered under the selected route.', noRouteBuses: 'No buses are assigned to this route.',
    routeSummary: 'Route-wise Summary', reportDate: 'Report Date',
    owner_name: 'Bus Owner Name', owner_mobile: 'Mobile Number',
    activate: 'Activate', deactivate: 'Deactivate', busStatusSaved: 'Bus status updated.',
    busStatusInvalid: 'Bus status must be Active or Inactive.',
    total_buses: 'Total Buses', active_buses: 'Active Buses', inactive_buses: 'Inactive Buses',
    fundWiseReport: 'Fund-wise Report', incomeReport: 'Income Report', expenseReport: 'Expense Report',
    income_paisa: 'Income', expense_paisa: 'Expense', cash_out_paisa: 'Cash Out', balance_paisa: 'Balance',
    period: 'Period', buses: 'Buses', success: 'Success', failed: 'Failed', repair: 'Repair',
    memberWiseReport: 'Member-wise Report',
    receiptsReport: 'Receipt Report',
    cashInReport: 'Cash In Report',
    startDate: 'Start Date', endDate: 'End Date', busStatus: 'Bus Status',
    viewReport: 'View Report', printReport: 'Print', downloadPdf: 'Download PDF',
    busStatusSummary: 'Bus Status Summary', totalBus: 'Total Bus', activeBus: 'Active Bus',
    inactiveBus: 'Inactive Bus', busList: 'Bus List', serial: 'Serial', busNumber: 'Bus Number',
    mobileNumber: 'Mobile Number', cashInDetails: 'Cash In Details', totalTrip: 'Total Trip',
    remarks: 'Remarks', reportPeriod: 'Report Period', selectedRoute: 'Selected Route',
    generatedAt: 'Generated', preparedBy: 'Prepared By', authorizedSignature: 'Authorized Signature',
    associationPhone: 'Phone Number',
    regularCashInReport: 'Regular Cash In Report',
    holidayCashInReport: 'Holiday Cash In Report',
    combinedCashInReport: 'Combined Cash In Report',
    cashOutReport: 'Cash Out Report',
    cashOutSummary: 'Cash Out Summary',
    dailyCashbookReport: 'Daily Cashbook Report',
    cashInType: 'Cash In Type',
    cash_in_type: 'Cash In Type',
    regularCashIn: 'Regular',
    holidayCashIn: 'Holiday',
    cashbookTransactionType: 'Cashbook Transaction',
    printA4: 'Print A4',
    per_trip_paisa: 'Per Trip (BDT)',
    total_trips: 'Trips',
    total_amount_paisa: 'Total Amount (BDT)',
    incomeVsExpense: 'Monthly Income vs Expense',
    noChartData: 'Add income or expense entries to see the chart.',
    amount_paisa: 'Amount',
    route_name: 'Route Name',
    fund_name: 'Fund Name',
    cashIn: 'Cash In',
    cashOut: 'Cash Out',
    cashbook: 'Cashbook',
    totalCashIn: 'Total Cash In',
    totalRegularCashIn: 'Total Regular Cash In',
    totalHolidayCashIn: 'Total Holiday Cash In',
    totalCashOut: 'Total Cash Out',
    availableCash: 'Available Cash Balance',
    fundWiseBalance: 'Fund-wise Balance',
    fundWiseHistory: 'Fund-wise Transaction History',
    cashInHistory: 'Cash In History',
    cashOutHistory: 'Cash Out History',
    cashOutDetails: 'Cash Out Details',
    expenseDescription: 'Expense Description',
    legacyDistribution: 'Legacy distribution',
    totalVouchers: 'Total Vouchers',
    addCashIn: 'Add Cash In',
    addCashOut: 'Add Cash Out',
    perTripAmount: 'Per Trip Amount (BDT)',
    perTripFundAmount: 'Per Trip Fund Amount (BDT)',
    totalTrips: 'Total Trips',
    totalAmount: 'Total Amount (BDT)',
    cashInSaved: 'Cash In saved successfully.',
    cashInDuplicate: 'This Cash In entry was already recorded.',
    cashOutSaved: 'Cash Out saved successfully.',
    cashOutDuplicate: 'This Cash Out entry was already recorded.',
    clearAll: 'Delete All',
    confirmClearCashIn: 'Delete all Cash In entries, including legacy income and receipts? Delete all Cash Out entries first.',
    confirmClearCashOut: 'Delete all Cash Out entries, including legacy entries? Fund balances will be recalculated.',
    view: 'View',
    cashInFormHint: 'Route amount is loaded automatically. Enter the completed trip count.',
    cashOutFormHint: 'Choose a route. All its assigned funds are selected automatically; enter the total trips.',
    noFundsForRoute: 'No fund is assigned to this route. Assign funds in Fund Management first.',
    assignedFunds: 'Assigned Funds',
    grandTotal: 'Grand Total (BDT)',
    selectAtLeastOneFund: 'Select at least one fund.',
    enterTotalTrips: 'Enter total trips.',
    fund: 'Fund',
    party: 'Party',
    bus: 'Bus',
    receipt_number: 'Receipt No.',
    paid_paisa: 'Paid',
    staffAccess: 'Staff access',
    manage: 'Manage',
    associationSetup: 'Association identity',
    associationName: 'Association name',
    associationAddress: 'Address printed on receipts',
    associationLogo: 'Logo',
    autoBackup: 'Automatic daily backup',
    backupFolder: 'Backup folder',
    keepCopies: 'Backup days to keep',
    choose: 'Choose...',
    openFolder: 'Open folder',
    correctionHint: 'Only an administrator can correct or delete a saved entry.',
    action: 'Action',
    record: 'Record',
    record_id: 'Record ID',
    result: 'Result',
    restoreConfirm: 'Restoring replaces the current association database with the backup file. Continue?',
    photoNeedsSave: 'Save the owner record before adding a photograph.',
    reprint: 'Reprint',
    identityHint: 'This name, address and logo are printed on every receipt and report.',
    autoBackupHint: 'The app saves a copy of the database to the chosen folder each day it is opened.',
    folderRequired: 'Choose a backup folder first.',
    logoSelected: 'Logo will be used on new receipts and reports.',
    settingsSaved: 'Settings saved.',
    paymentStatus: 'Payment Status',
    paid: 'Paid',
    unpaid: 'Unpaid',
    note: 'Note',
    owner: 'Owner',
    route: 'Route',
    charge_paisa: 'Route Charge (poisha)',
    monthly_fee_paisa: 'Monthly Fee (poisha)',
    opening_balance_paisa: 'Opening Balance (poisha)',
    loginFailed: 'Incorrect username or password.',
    pleaseSignIn: 'Please sign in first.',
    setupDone: 'Initial setup has already been completed.',
    adminOnly: 'Administrator permission is required.',
    adminSettingsOnly: 'Only an administrator can change association settings.',
    adminCorrectOnly: 'Only an administrator can correct a saved transaction.',
    adminDeleteOnly: 'Only an administrator can delete a transaction.',
    noPermission: 'You do not have permission to {0} {1}.',
    manageAction: 'manage',
    deleteAction: 'delete',
    oneAdminRequired: 'At least one active administrator must remain.',
    invalidRole: 'Invalid user role.',
    userFieldsRequired: 'Name, username, and a password of at least 8 characters are required.',
    passwordShort: 'New password must contain at least 8 characters.',
    currentPasswordWrong: 'Current password is incorrect.',
    cannotDisableSelf: 'You cannot disable your signed-in account.',
    userNotFound: 'User not found.',
    ownerNotFound: 'Bus owner not found.',
    busNotFound: 'Bus not found.',
    routeNotFound: 'Route not found.',
    fundNotFound: 'Fund not found.',
    receiptNotFound: 'Receipt not found.',
    transactionNotFound: 'Transaction not found.',
    recordNotFound: 'Record not found.',
    unknownRecord: 'Unknown record type.',
    invalidValue: 'That value is not allowed for this field.',
    amountPositive: 'Amount must be greater than zero.',
    amountNegative: 'Amount cannot be negative.',
    wholeNumber: '{0} must be a whole number.',
    duplicateValue: 'This value is already used by another record.',
    recordInUse: 'This record is used elsewhere and cannot be deleted.',
    cashOutTooBig: 'Cash Out cannot exceed the available cash balance.',
    cashInLowerThanCashOut: 'This change would make available Cash In lower than the amount already paid out.',
    cashOutRequestKeyRequired: 'A valid Cash Out request key is required.',
    cashOutRequestKeyUsed: 'This Cash Out request key was already used for a different entry.',
    cashOutAdminEdit: 'Only an administrator can edit a Cash Out entry.',
    cashOutAdminDelete: 'Only an administrator can delete a Cash Out entry.',
    cashInAdminClear: 'Only an administrator can clear Cash In entries.',
    cashOutAdminClear: 'Only an administrator can clear Cash Out entries.',
    cashInClearBlocked: 'Delete all Cash Out entries before clearing Cash In.',
    cashOutNotFound: 'Cash Out entry not found.',
    legacyCashOutLocked: 'Legacy Cash Out entries cannot be changed.',
    cashOutBatchEditRequired: 'Edit this Cash Out from its multi-fund batch entry.',
    fundRouteMismatch: 'The selected fund is not assigned to this route.',
    fundPerTripRequired: 'The selected fund does not have a valid per-trip amount.',
    chooseActiveRoute: 'Choose an active route.',
    chooseActiveRouteAmount: 'Choose an active route with a valid per-trip amount.',
    tripsPositive: 'Total trips must be greater than zero.',
    cashInRequestKeyRequired: 'A valid Cash In request key is required.',
    cashInRequestKeyUsed: 'This Cash In request key was already used for a different entry.',
    cashInAdminEdit: 'Only an administrator can edit a Cash In entry.',
    cashInAdminDelete: 'Only an administrator can delete a Cash In entry.',
    cashInNotFound: 'Cash In entry not found.',
    routeNameRequired: 'Route name is required.',
    fundNameRequired: 'Fund name is required.',
    fundRouteRequired: 'Choose a route for this fund.',
    chooseActiveFund: 'Choose an active fund.',
    validDateRequired: 'Enter a valid transaction date.',
    chooseDifferentFile: 'Choose a different database file.',
    backupFolderOnly: 'Only the configured backup folder can be opened.',
    backupCheckFailed: 'Backup integrity check failed: {0}',
    backupMissingTable: 'Backup is missing required table: {0}',
    tagline: 'Management System',
    income_categories: 'Income Categories',
    expense_categories: 'Expense Categories',
    importExcel: 'Import from Excel',
    importBusOwnerTitle: 'Import Bus Owners',
    importBusOwnerHint: 'Upload an .xlsx, .xls or .docx file containing owner name, bus number, father name, mobile number, address and status. Bus numbers must be unique; existing owners are matched by mobile number.',
    importFundsTitle: 'Import Funds',
    importFundsHint: 'Upload an .xlsx, .xls or .docx file containing fund name, route name, per trip amount, opening balance and status. Fund names must be unique; the route must already be saved.',
    chooseExcelFile: 'Choose Import File',
    downloadTemplate: 'Download Template',
    importSelectedFile: 'Selected file',
    importSheet: 'Sheet',
    importRowsDetected: 'rows detected',
    importMappingTitle: 'Map Excel Columns',
    importMappingHint: 'Match each Excel column to a database field. Required fields are marked with *.',
    notMapped: 'Not mapped',
    previewImport: 'Preview Import',
    importPreviewTitle: 'Import Preview',
    totalExcelRows: 'Total Excel Rows',
    validRecords: 'Valid Records',
    duplicateRecords: 'Duplicate Records',
    invalidRecords: 'Invalid Records',
    importValidRecords: 'Import Valid Records',
    backToMapping: 'Back',
    importResultTitle: 'Import Result',
    importedRecords: 'Successfully Imported',
    failedRecords: 'Failed Records',
    downloadErrorExcel: 'Download Error Excel',
    importNoFile: 'Choose an import file first.',
    importMappingRequiredError: 'Map all required fields before previewing.',
    importRow: 'Row',
    importReason: 'Reason',
    importValidLabel: 'Valid',
    importDuplicateLabel: 'Duplicate',
    importInvalidLabel: 'Invalid',
    importFailedLabel: 'Failed',
    importNoIssues: 'No failed or duplicate rows.',
    importTemplateSaved: 'Import template saved.',
    importExistingOwner: 'Existing owner',
    importPreviewNote: 'Only valid rows will be imported. Duplicate and invalid rows are reported separately and can be exported after import.',
    importAllDuplicates: 'Nothing to import: all {0} rows are duplicates because those bus numbers already exist. Existing records were not changed.',
    importSavedSummary: 'Successfully saved: {0}',
    importNoneSaved: 'No records were saved. Review the failed and duplicate rows.',
    importNoValidRecords: 'No valid records found. Please correct the errors.',
    importFailed: 'Import failed',
    banks: 'Bank Management',
    bankName: 'Bank Name', branchName: 'Branch Name', accountHolder: 'Account Holder Name',
    accountNumber: 'Account Number', accountType: 'Account Type', routingNumber: 'Routing Number',
    openingBalance: 'Opening Balance (BDT)', addBank: 'Add Bank', editBank: 'Edit Bank',
    currentBalance: 'Current Balance', bankWiseBalance: 'Bank-wise Balance',
    totalBankBalance: 'Total Bank Balance', totalDeposit: 'Total Deposit', totalBanks: 'Total Banks',
    fundToBankDeposit: 'Fund to Bank Deposit', selectBank: 'Select Bank', selectFund: 'Select Fund',
    fundAvailableBalance: 'Fund Available Balance', depositAmount: 'Deposit Amount (BDT)',
    transactionId: 'Bank Transaction ID / Slip No.', saveDeposit: 'Save Deposit',
    depositHistory: 'Bank Deposit History', bankReport: 'Bank Report',
    bankWiseReport: 'Bank-wise Report', fundWiseBankReport: 'Fund-wise Bank Deposit Report',
    totalWithdrawal: 'Total Withdrawal', bankAccountInfo: 'Selected Bank Account',
    bankInfoHint: 'Choose a bank to view its account information.',
    noBanks: 'No bank account has been added yet.', depositSaved: 'Bank deposit saved successfully.',
    bankSaved: 'Bank information saved.', depositDeleted: 'Bank deposit deleted and balances reversed.',
    confirmDeleteBank: 'Delete this bank account? A bank with deposits cannot be deleted.',
    confirmDeleteDeposit: 'Delete this bank deposit? The fund and bank balances will be reversed.',
    bankNameRequired: 'Bank name is required.', accountNumberRequired: 'Account number is required.',
    openingBalanceInvalid: 'Opening balance must be zero or greater.',
    accountNumberUsed: 'This account number is already registered.',
    bankHasDeposits: 'This bank has deposits recorded. Delete those deposits before deleting the bank.',
    chooseBank: 'Choose a valid bank account.',
    depositAmountPositive: 'Deposit amount must be greater than zero.',
    txnRequired: 'Bank transaction ID / slip number is required.',
    txnDuplicate: 'This transaction ID is already recorded for the selected bank.',
    depositTooBig: "Deposit cannot exceed the fund's available balance ({0}).",
    bankNotFound: 'Bank not found.', depositNotFound: 'Bank Deposit not found.',
    depositAdminEdit: 'Only an administrator can edit a Bank Deposit.',
    depositAdminDelete: 'Only an administrator can delete a Bank Deposit.',
    depositNote: 'Note', depositCount: 'Deposits', bankDeposit: 'Bank Deposit',
    bankDepositHint: 'A deposit moves money from the selected fund into the selected bank. It is a transfer, not new income.',
    depositFilterHint: 'Filter the deposit history by date and bank. The report below always shows all deposits.',
    allBanks: 'All Banks', resetFilters: 'Reset',
    softwareUpdate: 'Software Update', currentVersion: 'Installed Version', checkForUpdates: 'Check for Updates',
    updateAvailable: 'Update available', updateReady: 'Update downloaded and ready to install',
    updateDownloading: 'Downloading update', updateUpToDate: 'You are using the latest version',
    updateChecking: 'Checking for updates...', installUpdate: 'Install Update and Restart',
    updateLater: 'Remind me later', skipVersion: 'Skip this version', updateNow: 'Update now',
    mandatoryUpdate: 'This update is required to keep using the software.',
    mandatoryUpdateHint: 'Please install it now. The software will close by itself and reopen with the new version.',
    releaseNotes: 'What is new', releaseDate: 'Release date', minimumVersion: 'Minimum supported version',
    restartingForUpdate: 'The software will close and restart to finish the update.',
    updateFailed: 'The update could not be completed.', lastChecked: 'Last checked', neverChecked: 'Never checked',
    downloadsInBackground: 'The update downloads in the background. You can keep working.',
    updatesDisabled: 'Automatic updates are not configured for this installation.',
    updateOffline: 'Offline — the update check could not reach the server',
    blockedOffline: 'A security policy requires this software to verify updates online. Connect to the internet to continue.',
  },
  bn: {
    brand: 'বাস মালিক সমিতি', workspace: 'সমিতি ব্যবস্থাপনা', offline: 'অফলাইনে প্রস্তুত', logout: 'লগ আউট',
    dashboard: 'ড্যাশবোর্ড', owners: 'বাস মালিক', buses: 'বাসসমূহ', routes: 'রুটসমূহ',
    members: 'সদস্য', cashbook: 'ক্যাশবুক', reports: 'রিপোর্ট',
    users: 'ব্যবহারকারী ও অনুমতি', settings: 'সেটিংস ও ব্যাকআপ', totalBuses: 'মোট বাস',
    totalActiveBuses: 'মোট সক্রিয় বাস', totalInactiveBuses: 'মোট নিষ্ক্রিয় বাস', totalOwners: 'বাস মালিক',
    funds: 'তহবিল',
    totalRoutes: 'রুট', 
    today: 'আজকের আদায়', month: 'মাসিক আদায়',
    fundBalance: 'মোট তহবিল', expenses: 'মোট ব্যয়',
    recent: 'সাম্প্রতিক লেনদেন', fundsSummary: 'তহবিলের স্থিতি', add: 'নতুন যোগ করুন', search: 'খুঁজুন...',
    busListSearch: 'বাস নম্বর, মালিক, মোবাইল বা রুট দিয়ে খুঁজুন...',
    actions: 'কার্যক্রম', edit: 'সম্পাদনা', delete: 'মুছুন', save: 'সংরক্ষণ', cancel: 'বাতিল', noRows: 'কোনো তথ্য পাওয়া যায়নি।',
    name: 'নাম', mobile: 'মোবাইল নম্বর', address: 'ঠিকানা', nominee_name: 'মনোনীত ব্যক্তি', father_name: 'পিতার নাম',
    photo_path: 'ছবি', route_number: 'রুট নম্বর', starting_point: 'শুরুর স্থান', destination: 'গন্তব্য',
    charge_bdt: 'রুট চার্জ (টাকা)', description: 'বিবরণ', registration_number: 'বাসের রেজিস্ট্রেশন নম্বর',
    owner_id: 'বাস মালিক', route_id: 'রুট', driver_name: 'চালকের নাম', helper_name: 'সহকারীর নাম', status: 'অবস্থা',
    membership_date: 'সদস্যপদ তারিখ', member_type: 'সদস্যের ধরন', monthly_fee_bdt: 'মাসিক ফি (টাকা)',
    opening_balance_bdt: 'প্রারম্ভিক জমা (টাকা)', is_active: 'সক্রিয়', date: 'তারিখ', bus_id: 'বাস',
    fund_id: 'তহবিল',
    transaction_type: 'লেনদেনের ধরন', category: 'খাত', amount_bdt: 'পরিমাণ (টাকা)', member_id: 'সদস্য',
    description_label: 'বিবরণ', from_fund_id: 'যে তহবিল থেকে', to_fund_id: 'যে তহবিলে',
    exportPdf: 'PDF রপ্তানি',
    exportExcel: 'Excel রপ্তানি', from: 'শুরুর তারিখ', to: 'শেষ তারিখ', ledger: 'লেনদেনের তালিকা',
    addIncome: 'আয় যোগ', addExpense: 'ব্যয় যোগ', transfer: 'তহবিল স্থানান্তর', backup: 'ডাটাবেস ব্যাকআপ',
    restore: 'ডাটাবেস পুনরুদ্ধার', changePassword: 'পাসওয়ার্ড পরিবর্তন', username: 'ইউজারনেম', full_name: 'পূর্ণ নাম',
    password: 'পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)', role: 'ভূমিকা', administrator: 'প্রশাসক', staff: 'কর্মী',
    login: 'লগ ইন', setup: 'প্রশাসক অ্যাকাউন্ট তৈরি', signInPrompt: 'সমিতির কার্যক্রম পরিচালনায় লগ ইন করুন।',
    setupPrompt: 'প্রথমবার ব্যবহার: প্রশাসক অ্যাকাউন্ট তৈরি করুন।', current_password: 'বর্তমান পাসওয়ার্ড',
    new_password: 'নতুন পাসওয়ার্ড', transactions: 'লেনদেন',
    loading: 'লোড হচ্ছে...', owner_code: 'মালিক আইডি', member_code: 'সদস্য আইডি', total: 'মোট',
    confirmDelete: 'এই তথ্যটি মুছে ফেলবেন? সংশ্লিষ্ট আর্থিক তথ্য থাকলে মুছতে বাধা দেওয়া হবে।',
    saved: 'সফলভাবে সংরক্ষণ হয়েছে।', paymentSaved: 'পেমেন্ট সংরক্ষিত এবং রসিদ তৈরি হয়েছে.',
    noPermission: 'এই কাজের অনুমতি আপনার নেই।',
    reportType: 'রিপোর্টের ধরন', receipt: 'রসিদ',
    appSettings: 'সমিতির সেটআপ', setupHint: 'পাসওয়ার্ড পরিবর্তন, ডাটাবেস ব্যাকআপ এবং কর্মী অ্যাকাউন্ট পরিচালনা করুন।',
    userHint: 'শুধু প্রশাসক ব্যবহারকারী যোগ এবং কর্মী অনুমতি নির্ধারণ করতে পারেন.',
    modal: 'তথ্য বিবরণ', invalid: 'আবশ্যক তথ্যগুলো যাচাই করুন।',
    active: 'সক্রিয়', inactive: 'নিষ্ক্রিয়', close: 'বন্ধ করুন',
    transferDone: 'তহবিল স্থানান্তর সংরক্ষিত।', backupDone: 'ডাটাবেস ব্যাকআপ সংরক্ষিত।', restoreDone: 'ডাটাবেস পুনরুদ্ধার হয়েছে। আবার লগ ইন করুন।',
    passwordChanged: 'পাসওয়ার্ড পরিবর্তন হয়েছে।', selectFund: 'তহবিল নির্বাচন', selectOwner: 'মালিক নির্বাচন',
    selectRoute: 'রুট নির্বাচন', selectBus: 'বাস নির্বাচন', selectMember: 'সদস্য নির্বাচন',
    amountWords: 'সব অর্থ পয়সার পূর্ণসংখ্যা হিসেবে সংরক্ষিত হয়।',
    typeIncome: 'আয়', typeExpense: 'ব্যয়', other: 'অন্যান্য', starting: 'শুরুর তারিখ',
    account: 'হিসাব', printOwner: 'মালিকের তথ্য প্রিন্ট', permissions: 'অনুমতি', activityLog: 'কার্যক্রম লগ',
    loginHistory: 'লগইন ইতিহাস', disable: 'নিষ্ক্রিয় করুন', enable: 'সক্রিয় করুন', showReport: 'রিপোর্ট দেখুন',
    dailyCollection: 'দৈনিক আদায়', monthlyCollection: 'মাসিক আদায়', yearlyCollection: 'বার্ষিক আদায়',
    busWiseReport: 'বাসভিত্তিক রিপোর্ট', ownerWiseReport: 'মালিকভিত্তিক রিপোর্ট', routeWiseReport: 'রুটভিত্তিক রিপোর্ট',
    busStatusReport: 'বাস স্ট্যাটাস রিপোর্ট', allRoutes: 'সব রুট', allStatuses: 'সব স্ট্যাটাস',
    activeOnly: 'শুধু সক্রিয়', inactiveOnly: 'শুধু নিষ্ক্রিয়', searchByBusNumber: 'বাস নম্বর দিয়ে খুঁজুন...',
    busStatusListReport: 'রুটভিত্তিক বাস তালিকা', routeBuses: 'এই রুটের বাসসমূহ',
    routeBusHint: 'নির্বাচিত রুটে নিবন্ধিত বাসসমূহ।', noRouteBuses: 'এই রুটে কোনো বাস নিবন্ধিত নেই।',
    routeSummary: 'রুটভিত্তিক সারসংক্ষেপ', reportDate: 'রিপোর্টের তারিখ',
    owner_name: 'বাস মালিকের নাম', owner_mobile: 'মোবাইল নম্বর',
    activate: 'সক্রিয় করুন', deactivate: 'নিষ্ক্রিয় করুন', busStatusSaved: 'বাসের স্ট্যাটাস আপডেট হয়েছে।',
    busStatusInvalid: 'বাসের স্ট্যাটাস সক্রিয় অথবা নিষ্ক্রিয় হতে হবে।',
    total_buses: 'মোট বাস', active_buses: 'সক্রিয় বাস', inactive_buses: 'নিষ্ক্রিয় বাস',
    fundWiseReport: 'তহবিলভিত্তিক রিপোর্ট', incomeReport: 'আয়ের রিপোর্ট', expenseReport: 'ব্যয়ের রিপোর্ট',
    income_paisa: 'আয়', expense_paisa: 'ব্যয়', cash_out_paisa: 'ক্যাশ আউট', balance_paisa: 'স্থিতি',
    period: 'সময়কাল', buses: 'বাস', success: 'সফল', failed: 'ব্যর্থ', repair: 'মেরামত',
    totalMembers: 'সদস্য',
    cashInReport: 'ক্যাশ ইন রিপোর্ট',
    startDate: 'শুরুর তারিখ', endDate: 'শেষ তারিখ', busStatus: 'বাসের স্ট্যাটাস',
    viewReport: 'রিপোর্ট দেখুন', printReport: 'প্রিন্ট', downloadPdf: 'PDF ডাউনলোড',
    busStatusSummary: 'বাস স্ট্যাটাস সারসংক্ষেপ', totalBus: 'মোট বাস', activeBus: 'সক্রিয় বাস',
    inactiveBus: 'নিষ্ক্রিয় বাস', busList: 'বাস তালিকা', serial: 'ক্রমিক', busNumber: 'বাস নম্বর',
    mobileNumber: 'মোবাইল নম্বর', cashInDetails: 'ক্যাশ ইন বিবরণ', totalTrip: 'মোট ট্রিপ',
    remarks: 'মন্তব্য', reportPeriod: 'রিপোর্টের সময়কাল', selectedRoute: 'নির্বাচিত রুট',
    generatedAt: 'তৈরি হয়েছে', preparedBy: 'প্রস্তুতকারী', authorizedSignature: 'অনুমোদিত স্বাক্ষর',
    associationPhone: 'ফোন নম্বর',
    regularCashInReport: 'নিয়মিত ক্যাশ ইন রিপোর্ট',
    holidayCashInReport: 'ছুটির দিনের ক্যাশ ইন রিপোর্ট',
    combinedCashInReport: 'সম্মিলিত ক্যাশ ইন রিপোর্ট',
    cashOutReport: 'ক্যাশ আউট রিপোর্ট',
    cashOutSummary: 'ক্যাশ আউট সারাংশ',
    dailyCashbookReport: 'দৈনিক ক্যাশবুক রিপোর্ট',
    cashInType: 'ক্যাশ ইন-এর ধরন',
    cash_in_type: 'ক্যাশ ইন-এর ধরন',
    regularCashIn: 'নিয়মিত',
    holidayCashIn: 'ছুটির দিন',
    cashbookTransactionType: 'ক্যাশবুক লেনদেন',
    printA4: 'A4 প্রিন্ট',
    per_trip_paisa: 'প্রতি ট্রিপ (টাকা)',
    total_trips: 'ট্রিপ',
    total_amount_paisa: 'মোট পরিমাণ (টাকা)',
    monthlyExpenses: 'এ মাসের ব্যয়',
    driver_mobile: 'চালকের মোবাইল',
    amount_paisa: 'পরিমাণ',
    route_name: 'রুটের নাম',
    fund_name: 'তহবিলের নাম',
    cashIn: 'ক্যাশ ইন',
    cashOut: 'ক্যাশ আউট',
    cashbook: 'ক্যাশবুক',
    totalCashIn: 'মোট ক্যাশ ইন',
    totalRegularCashIn: 'মোট নিয়মিত ক্যাশ ইন',
    totalHolidayCashIn: 'মোট ছুটির দিনের ক্যাশ ইন',
    totalCashOut: 'মোট ক্যাশ আউট',
    availableCash: 'উপলব্ধ ক্যাশ ব্যালেন্স',
    fundWiseBalance: 'তহবিলভিত্তিক স্থিতি',
    fundWiseHistory: 'তহবিলভিত্তিক লেনদেন ইতিহাস',
    cashInHistory: 'ক্যাশ ইন ইতিহাস',
    cashOutHistory: 'ক্যাশ আউট ইতিহাস',
    cashOutDetails: 'ক্যাশ আউট বিবরণ',
    expenseDescription: 'ব্যয়ের বিবরণ',
    legacyDistribution: 'পুরোনো বিতরণ',
    totalVouchers: 'মোট ভাউচার',
    addCashIn: 'ক্যাশ ইন যোগ করুন',
    addCashOut: 'ক্যাশ আউট যোগ করুন',
    perTripAmount: 'প্রতি ট্রিপের পরিমাণ (টাকা)',
    perTripFundAmount: 'প্রতি ট্রিপের তহবিল পরিমাণ (টাকা)',
    totalTrips: 'মোট ট্রিপ',
    totalAmount: 'মোট পরিমাণ (টাকা)',
    cashInSaved: 'ক্যাশ ইন সংরক্ষণ হয়েছে।',
    cashInDuplicate: 'এই ক্যাশ ইন এন্ট্রি আগেই সংরক্ষণ হয়েছে।',
    cashOutSaved: 'ক্যাশ আউট সংরক্ষণ হয়েছে।',
    cashOutDuplicate: 'এই ক্যাশ আউট এন্ট্রি আগেই সংরক্ষণ হয়েছে।',
    clearAll: 'সব মুছুন',
    confirmClearCashIn: 'সব ক্যাশ ইন এন্ট্রি (পুরোনো আয় ও রসিদসহ) মুছবেন? আগে সব ক্যাশ আউট এন্ট্রি মুছতে হবে।',
    confirmClearCashOut: 'সব ক্যাশ আউট এন্ট্রি (পুরোনো এন্ট্রিসহ) মুছবেন? তহবিলের ব্যালেন্স আবার হিসাব হবে।',
    view: 'দেখুন',
    cashInFormHint: 'রুটের পরিমাণ স্বয়ংক্রিয়ভাবে আসবে। সম্পন্ন ট্রিপের সংখ্যা লিখুন।',
    cashOutFormHint: 'রুট বেছে নিন। সেই রুটের সব নির্ধারিত তহবিল স্বয়ংক্রিয়ভাবে নির্বাচিত হবে; মোট ট্রিপ লিখুন।',
    noFundsForRoute: 'এই রুটে কোনো তহবিল নির্ধারিত নেই। প্রথমে তহবিল ব্যবস্থাপনায় তহবিল নির্ধারণ করুন।',
    assignedFunds: 'নির্ধারিত তহবিলসমূহ',
    grandTotal: 'সর্বমোট (টাকা)',
    selectAtLeastOneFund: 'কমপক্ষে একটি তহবিল নির্বাচন করুন।',
    enterTotalTrips: 'মোট ট্রিপ লিখুন।',
    fund: 'তহবিল',
    bus_type: 'বাসের ধরন',
    join_date: 'যোগদানের তারিখ',
    receiver_name: 'গ্রহীতার নাম',
    reference_number: 'রেফারেন্স নম্বর',
    memberWiseReport: 'সদস্যভিত্তিক রিপোর্ট',
    receiptsReport: 'রসিদ রিপোর্ট',
    incomeVsExpense: 'মাসিক আয় ও ব্যয়',
    noChartData: 'চার্ট দেখতে আয় বা ব্যয়ের এন্ট্রি যোগ করুন.',
    party: 'পক্ষ',
    bus: 'বাস',
    receipt_number: 'রসিদ নম্বর',
    paid_paisa: 'পরিশোধিত',
    staffAccess: 'কর্মীর অনুমতি',
    manage: 'পরিচালনা',
    associationSetup: 'সমিতির পরিচয়',
    associationName: 'সমিতির নাম',
    associationAddress: 'রসিদে ছাপার ঠিকানা',
    associationLogo: 'লোগো',
    autoBackup: 'স্বয়ংক্রিয় দৈনিক ব্যাকআপ',
    backupFolder: 'ব্যাকআপ ফোল্ডার',
    keepCopies: 'কত দিনের ব্যাকআপ রাখবেন',
    choose: 'নির্বাচন...',
    openFolder: 'ফোল্ডার খুলুন',
    correctionHint: 'সংরক্ষিত এন্ট্রি শুধু প্রশাসক সম্পাদনা বা মুছে ফেলতে পারবেন।',
    action: 'কর্ম',
    record: 'রেকর্ড',
    record_id: 'রেকর্ড আইডি',
    result: 'ফলাফল',
    restoreConfirm: 'পুনরুদ্ধার করলে বর্তমান ডাটাবেসের বদলে ব্যাকআপ ফাইল বসে যাবে। চালিয়ে যাবেন?',
    photoNeedsSave: 'ছবি যোগ করার আগে মালিকের রেকর্ড সংরক্ষণ করুন।',
    reprint: 'আবার ছাপুন',
    identityHint: 'এই নাম, ঠিকানা ও লোগো প্রতিটি রসিদ ও রিপোর্টে ছাপা হবে।',
    autoBackupHint: 'প্রতিবার অ্যাপ খুললে নির্বাচিত ফোল্ডারে ডাটাবেসের একটি কপি স্বয়ংক্রিয়ভাবে সংরক্ষিত হবে।',
    folderRequired: 'প্রথমে একটি ব্যাকআপ ফোল্ডার নির্বাচন করুন।',
    logoSelected: 'নতুন রসিদ ও রিপোর্টে এই লোগো ব্যবহার হবে।',
    settingsSaved: 'সেটিংস সংরক্ষিত হয়েছে।',
    paymentStatus: 'পেমেন্টের অবস্থা',
    paid: 'পরিশোধিত',
    unpaid: 'বকেয়া',
    note: 'নোট',
    owner: 'মালিক',
    route: 'রুট',
    charge_paisa: 'রুট চার্জ (পয়সা)',
    monthly_fee_paisa: 'মাসিক ফি (পয়সা)',
    opening_balance_paisa: 'প্রারম্ভিক জমা (পয়সা)',
    loginFailed: 'ভুল ইউজারনেম বা পাসওয়ার্ড।',
    pleaseSignIn: 'অনুগ্রহ করে প্রথমে লগ ইন করুন।',
    setupDone: 'অ্যাডমিন অ্যাকাউন্ট আগেই তৈরি হয়েছে।',
    adminOnly: 'এই কাজের জন্য প্রশাসকের অনুমতি প্রয়োজন।',
    adminSettingsOnly: 'শুধু প্রশাসক সমিতির সেটিংস পরিবর্তন করতে পারবেন।',
    adminCorrectOnly: 'শুধু প্রশাসক সংরক্ষিত লেনদেন সংশোধন করতে পারবেন।',
    adminDeleteOnly: 'শুধু প্রশাসক লেনদেন মুছে ফেলতে পারবেন।',
    noPermission: '{1} {0} করার অনুমতি আপনার অ্যাকাউন্টে নেই।',
    manageAction: 'ব্যবস্থাপনা',
    deleteAction: 'মুছে ফেলা',
    oneAdminRequired: 'অন্তত একজন সক্রিয় প্রশাসক থাকতে হবে।',
    invalidRole: 'ব্যবহারকারীর ভূমিকা সঠিক নয়।',
    userFieldsRequired: 'নাম, ইউজারনেম ও কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড দিতে হবে।',
    passwordShort: 'নতুন পাসওয়ার্ডে কমপক্ষে ৮ অক্ষর থাকতে হবে।',
    currentPasswordWrong: 'বর্তমান পাসওয়ার্ড ভুল হয়েছে।',
    cannotDisableSelf: 'নিজেই যেই অ্যাকাউন্ট দিয়ে লগ ইন করেছেন তা বন্ধ করা যাবে না।',
    userNotFound: 'ব্যবহারকারী পাওয়া যায়নি।',
    ownerNotFound: 'বাস মালিক পাওয়া যায়নি।',
    busNotFound: 'বাস পাওয়া যায়নি।',
    routeNotFound: 'রুট পাওয়া যায়নি।',
    fundNotFound: 'তহবিল পাওয়া যায়নি।',
    receiptNotFound: 'রসিদ পাওয়া যায়নি।',
    transactionNotFound: 'লেনদেন পাওয়া যায়নি।',
    recordNotFound: 'রেকর্ড পাওয়া যায়নি।',
    unknownRecord: 'অজানা রেকর্ডের ধরন।',
    invalidValue: 'এই ফিল্ডে তথ্যটি গ্রহণযোগ্য নয়।',
    amountPositive: 'পরিমাণ শূন্যের বেশি হতে হবে।',
    amountNegative: 'পরিমাণ ঋণাত্মক হতে পারবে না।',
    wholeNumber: '{0} পূর্ণ সংখ্যা হতে হবে।',
    duplicateValue: 'এই তথ্য অন্য একটি রেকর্ডে আগেই ব্যবহৃত হয়েছে।',
    recordInUse: 'এই রেকর্ড অন্যখানে ব্যবহৃত আছে, মুছে ফেলা যাবে না।',
    cashOutTooBig: 'সহজলভ্য ব্যালেন্সের চেয়ে বেশি ক্যাশ আউট করা যাবে না।',
    cashInLowerThanCashOut: 'এই পরিবর্তনে ক্যাশ ইন ইতোমধ্যে পরিশোধিত অর্থের চেয়ে কম হয়ে যাবে।',
    cashOutRequestKeyRequired: 'সঠিক ক্যাশ আউট অনুরোধ নম্বর আবশ্যক।',
    cashOutRequestKeyUsed: 'এই ক্যাশ আউট অনুরোধ নম্বরটি অন্য এন্ট্রির জন্য আগে ব্যবহৃত হয়েছে।',
    cashOutAdminEdit: 'শুধু প্রশাসক ক্যাশ আউট এন্ট্রি সম্পাদনা করতে পারবেন।',
    cashOutAdminDelete: 'শুধু প্রশাসক ক্যাশ আউট এন্ট্রি মুছতে পারবেন।',
    cashInAdminClear: 'শুধু প্রশাসক সব ক্যাশ ইন এন্ট্রি মুছতে পারবেন।',
    cashOutAdminClear: 'শুধু প্রশাসক সব ক্যাশ আউট এন্ট্রি মুছতে পারবেন।',
    cashInClearBlocked: 'ক্যাশ ইন মুছতে আগে সব ক্যাশ আউট এন্ট্রি মুছুন।',
    cashOutNotFound: 'ক্যাশ আউট এন্ট্রি পাওয়া যায়নি।',
    legacyCashOutLocked: 'পুরোনো ক্যাশ আউট এন্ট্রি পরিবর্তন করা যাবে না।',
    cashOutBatchEditRequired: 'একাধিক তহবিলের এই ক্যাশ আউটটি ব্যাচ থেকে সম্পাদনা করুন।',
    fundRouteMismatch: 'নির্বাচিত তহবিলটি এই রুটের জন্য নির্ধারিত নয়।',
    fundPerTripRequired: 'নির্বাচিত তহবিলের সঠিক প্রতি-ট্রিপ পরিমাণ নেই।',
    chooseActiveRoute: 'সক্রিয় রুট বেছে নিন।',
    chooseActiveRouteAmount: 'সঠিক প্রতি-ট্রিপের পরিমাণসহ সক্রিয় রুট নির্বাচন করুন।',
    tripsPositive: 'মোট ট্রিপ শূন্যের বেশি হতে হবে।',
    cashInRequestKeyRequired: 'সঠিক ক্যাশ ইন অনুরোধ নম্বর আবশ্যক।',
    cashInRequestKeyUsed: 'এই ক্যাশ ইন অনুরোধ নম্বরটি অন্য এন্ট্রির জন্য আগে ব্যবহৃত হয়েছে।',
    cashInAdminEdit: 'শুধু প্রশাসক ক্যাশ ইন এন্ট্রি সম্পাদনা করতে পারবেন।',
    cashInAdminDelete: 'শুধু প্রশাসক ক্যাশ ইন এন্ট্রি মুছতে পারবেন।',
    cashInNotFound: 'ক্যাশ ইন এন্ট্রি পাওয়া যায়নি।',
    routeNameRequired: 'রুটের নাম দিতে হবে।',
    fundNameRequired: 'তহবিলের নাম দিতে হবে।',
    fundRouteRequired: 'এই তহবিলের জন্য একটি রুট বেছে নিন।',
    chooseActiveFund: 'সক্রিয় তহবিল বেছে নিন।',
    validDateRequired: 'সঠিক লেনদেনের তারিখ দিন।',
    chooseDifferentFile: 'অন্য একটি ডাটাবেস ফাইল বেছে নিন।',
    backupFolderOnly: 'শুধু নির্ধারিত ব্যাকআপ ফোল্ডারই খোলা যাবে।',
    backupCheckFailed: 'ব্যাকআপ যাচাই ব্যর্থ: {0}',
    backupMissingTable: 'ব্যাকআপে প্রয়োজনীয় টেবিল নেই: {0}',
    tagline: 'ব্যবস্থাপনা সফটওয়্যার',
    income_categories: 'আয়ের খাত',
    expense_categories: 'ব্যয়ের খাত',
    importExcel: 'এক্সেল থেকে আমদানি',
    importBusOwnerTitle: 'বাস মালিক আমদানি',
    importBusOwnerHint: 'মালিকের নাম, বাস নম্বর, পিতার নাম, মোবাইল নম্বর, ঠিকানা ও স্ট্যাটাসসহ .xlsx, .xls অথবা .docx ফাইল আপলোড করুন। বাস নম্বর অনন্য হতে হবে; মোবাইল নম্বর দিয়ে পুরোনো মালিক শনাক্ত হবে।',
    importFundsTitle: 'তহবিল আমদানি',
    importFundsHint: 'তহবিলের নাম, রুটের নাম, প্রতি ট্রিপের পরিমাণ, প্রারম্ভিক ব্যালেন্স ও স্ট্যাটাসসহ .xlsx, .xls অথবা .docx ফাইল আপলোড করুন। তহবিলের নাম অনন্য হতে হবে; রুটটি আগে থেকে সংরক্ষিত থাকতে হবে।',
    chooseExcelFile: 'আমদানি ফাইল বেছে নিন',
    downloadTemplate: 'টেমপ্লেট ডাউনলোড',
    importSelectedFile: 'নির্বাচিত ফাইল',
    importSheet: 'শিট',
    importRowsDetected: 'সারি পাওয়া গেছে',
    importMappingTitle: 'এক্সেলের কলাম মিলান',
    importMappingHint: 'প্রতিটি এক্সেল কলামকে ডাটাবেসের ফিল্ডের সাথে মিলান। আবশ্যক ফিল্ডে * চিহ্ন আছে।',
    notMapped: 'মিলানো হয়নি',
    previewImport: 'আমদানি প্রিভিউ',
    importPreviewTitle: 'আমদানি প্রিভিউ',
    totalExcelRows: 'মোট এক্সেল সারি',
    validRecords: 'সঠিক রেকর্ড',
    duplicateRecords: 'ডুপ্লিকেট রেকর্ড',
    invalidRecords: 'ভুল রেকর্ড',
    importValidRecords: 'সঠিক রেকর্ড আমদানি করুন',
    backToMapping: 'ফিরে যান',
    importResultTitle: 'আমদানির ফলাফল',
    importedRecords: 'সফলভাবে আমদানি হয়েছে',
    failedRecords: 'ব্যর্থ রেকর্ড',
    downloadErrorExcel: 'ত্রুটির এক্সেল ডাউনলোড',
    importNoFile: 'প্রথমে একটি আমদানি ফাইল বেছে নিন।',
    importMappingRequiredError: 'প্রিভিউ করার আগে সব আবশ্যক ফিল্ড মিলান।',
    importRow: 'সারি',
    importReason: 'কারণ',
    importValidLabel: 'সঠিক',
    importDuplicateLabel: 'ডুপ্লিকেট',
    importInvalidLabel: 'ভুল',
    importFailedLabel: 'ব্যর্থ',
    importNoIssues: 'কোনো ব্যর্থ বা ডুপ্লিকেট সারি নেই।',
    importTemplateSaved: 'আমদানি টেমপ্লেট সংরক্ষিত হয়েছে।',
    importExistingOwner: 'পুরোনো মালিক',
    importPreviewNote: 'শুধু সঠিক সারি আমদানি হবে। ডুপ্লিকেট ও ভুল সারি আলাদাভাবে দেখানো হবে এবং পরে এক্সেলে ডাউনলোড করা যাবে।',
    importAllDuplicates: 'আমদানি করার কিছু নেই: {0}টি সারিই ডুপ্লিকেট, কারণ এই বাস নম্বরগুলো আগে থেকেই আছে। পুরোনো রেকর্ড পরিবর্তন করা হয়নি।',
    importSavedSummary: 'সফলভাবে সংরক্ষিত: {0}',
    importNoneSaved: 'কোনো রেকর্ড সংরক্ষিত হয়নি। ব্যর্থ ও ডুপ্লিকেট সারি দেখুন।',
    importNoValidRecords: 'কোনো সঠিক রেকর্ড পাওয়া যায়নি। অনুগ্রহ করে ভুলগুলো সংশোধন করুন।',
    importFailed: 'আমদানি ব্যর্থ হয়েছে',
    banks: 'ব্যাংক ব্যবস্থাপনা',
    bankName: 'ব্যাংকের নাম', branchName: 'শাখার নাম', accountHolder: 'অ্যাকাউন্ট হোল্ডারের নাম',
    accountNumber: 'অ্যাকাউন্ট নম্বর', accountType: 'অ্যাকাউন্টের ধরন', routingNumber: 'রাউটিং নম্বর',
    openingBalance: 'প্রারম্ভিক ব্যালেন্স (টাকা)', addBank: 'ব্যাংক যোগ করুন', editBank: 'ব্যাংক সম্পাদনা',
    currentBalance: 'বর্তমান ব্যালেন্স', bankWiseBalance: 'ব্যাংকভিত্তিক ব্যালেন্স',
    totalBankBalance: 'মোট ব্যাংক ব্যালেন্স', totalDeposit: 'মোট জমা', totalBanks: 'মোট ব্যাংক',
    fundToBankDeposit: 'তহবিল থেকে ব্যাংকে জমা', selectBank: 'ব্যাংক নির্বাচন করুন', selectFund: 'তহবিল নির্বাচন করুন',
    fundAvailableBalance: 'তহবিলের প্রাপ্তব্য ব্যালেন্স', depositAmount: 'জমার পরিমাণ (টাকা)',
    transactionId: 'ব্যাংক ট্রানজেকশন আইডি / স্লিপ নম্বর', saveDeposit: 'জমা সংরক্ষণ করুন',
    depositHistory: 'ব্যাংক জমার ইতিহাস', bankReport: 'ব্যাংক রিপোর্ট',
    bankWiseReport: 'ব্যাংকভিত্তিক রিপোর্ট', fundWiseBankReport: 'তহবিলভিত্তিক ব্যাংক জমা রিপোর্ট',
    totalWithdrawal: 'মোট উত্তোলন', bankAccountInfo: 'নির্বাচিত ব্যাংক অ্যাকাউন্ট',
    bankInfoHint: 'অ্যাকাউন্টের তথ্য দেখতে একটি ব্যাংক নির্বাচন করুন।',
    noBanks: 'এখনো কোনো ব্যাংক অ্যাকাউন্ট যোগ করা হয়নি।', depositSaved: 'ব্যাংক জমা সফলভাবে সংরক্ষিত হয়েছে।',
    bankSaved: 'ব্যাংকের তথ্য সংরক্ষিত হয়েছে।', depositDeleted: 'ব্যাংক জমা মুছে ফেলা হয়েছে এবং ব্যালেন্স সমন্বয় করা হয়েছে।',
    confirmDeleteBank: 'এই ব্যাংক অ্যাকাউন্ট মুছে ফেলবেন? যে ব্যাংকে জমা আছে তা মুছে ফেলা যাবে না।',
    confirmDeleteDeposit: 'এই ব্যাংক জমা মুছে ফেলবেন? তহবিল ও ব্যাংক ব্যালেন্স সমন্বয় করা হবে।',
    bankNameRequired: 'ব্যাংকের নাম আবশ্যক।', accountNumberRequired: 'অ্যাকাউন্ট নম্বর আবশ্যক।',
    openingBalanceInvalid: 'প্রারম্ভিক ব্যালেন্স শূন্য বা তার বেশি হতে হবে।',
    accountNumberUsed: 'এই অ্যাকাউন্ট নম্বর আগে থেকেই নিবন্ধিত।',
    bankHasDeposits: 'এই ব্যাংকে জমা রয়েছে। ব্যাংক মুছার আগে জমাগুলো মুছে ফেলুন।',
    chooseBank: 'সঠিক ব্যাংক অ্যাকাউন্ট নির্বাচন করুন।',
    depositAmountPositive: 'জমার পরিমাণ শূন্যের বেশি হতে হবে।',
    txnRequired: 'ব্যাংক ট্রানজেকশন আইডি / স্লিপ নম্বর আবশ্যক।',
    txnDuplicate: 'এই ট্রানজেকশন আইডি নির্বাচিত ব্যাংকে আগে থেকেই রয়েছে।',
    depositTooBig: 'তহবিলের প্রাপ্তব্য ব্যালেন্সের ({0}) বেশি জমা দেওয়া যাবে না।',
    bankNotFound: 'ব্যাংক পাওয়া যায়নি।', depositNotFound: 'ব্যাংক জমা পাওয়া যায়নি।',
    depositAdminEdit: 'শুধু অ্যাডমিন ব্যাংক জমা সম্পাদনা করতে পারেন।',
    depositAdminDelete: 'শুধু অ্যাডমিন ব্যাংক জমা মুছতে পারেন।',
    depositNote: 'নোট', depositCount: 'জমার সংখ্যা', bankDeposit: 'ব্যাংক জমা',
    bankDepositHint: 'জমা নির্বাচিত তহবিল থেকে টাকা নির্বাচিত ব্যাংকে স্থানান্তর করে। এটি নতুন আয় নয়।',
    depositFilterHint: 'তারিখ ও ব্যাংক দিয়ে জমার ইতিহাস ফিল্টার করুন। নিচের রিপোর্টে সব জমা দেখানো হয়।',
    allBanks: 'সব ব্যাংক', resetFilters: 'রিসেট',
    softwareUpdate: 'সফটওয়্যার আপডেট', currentVersion: 'ইনস্টল করা ভার্সন', checkForUpdates: 'আপডেট পরীক্ষা করুন',
    updateAvailable: 'নতুন আপডেট পাওয়া গেছে', updateReady: 'আপডেট ডাউনলোড হয়েছে, ইনস্টল করার জন্য প্রস্তুত',
    updateDownloading: 'আপডেট ডাউনলোড হচ্ছে', updateUpToDate: 'আপনি সর্বশেষ ভার্সন ব্যবহার করছেন',
    updateChecking: 'আপডেট খোঁজা হচ্ছে...', installUpdate: 'ইনস্টল করে রিস্টার্ট করুন',
    updateLater: 'পরে মনে করিয়ে দিন', skipVersion: 'এই ভার্সন বাদ দিন', updateNow: 'এখনই আপডেট করুন',
    mandatoryUpdate: 'সফটওয়্যারটি ব্যবহার চালিয়ে যেতে এই আপডেটটি আবশ্যক।',
    mandatoryUpdateHint: 'অনুগ্রহ করে এখনই ইনস্টল করুন। সফটওয়্যারটি নিজে থেকে বন্ধ হয়ে নতুন ভার্সনে চালু হবে।',
    releaseNotes: 'নতুন কী আছে', releaseDate: 'প্রকাশের তারিখ', minimumVersion: 'সর্বনিম্ন সমর্থিত ভার্সন',
    restartingForUpdate: 'আপডেট শেষ করতে সফটওয়্যারটি বন্ধ হয়ে আবার চালু হবে।',
    updateFailed: 'আপডেট সম্পন্ন করা যায়নি।', lastChecked: 'সর্বশেষ পরীক্ষা', neverChecked: 'কখনো পরীক্ষা হয়নি',
    downloadsInBackground: 'আপডেট ব্যাকগ্রাউন্ডে ডাউনলোড হচ্ছে। আপনি কাজ চালিয়ে যেতে পারেন।',
    updatesDisabled: 'এই ইনস্টলেশনের জন্য স্বয়ংক্রিয় আপডেট কনফিগার করা নেই।',
    updateOffline: 'অফলাইন — আপডেট সার্ভারে পৌঁছানো যায়নি',
    blockedOffline: 'নিরাপত্তা নীতির কারণে সফটওয়্যারটি অনলাইনে আপডেট যাচাই করতে হবে। চালিয়ে যেতে ইন্টারনেটে সংযুক্ত হোন।',
  }
};

const menu = [
  ['dashboard', '⌂'], ['owners', '♙'], ['buses', '▣'], ['routes', '⇄'],
  ['members', '♧'], ['cashbook', '৳'], ['banks', '▦'], ['funds', '◉'], ['reports', '▤'], ['cashInReport', '▥'], ['cashOutReport', '▧'], ['users', '♙'], ['settings', '⚙']
];

const entityConfig = {
  owners: { title: 'owners', fields: [['name', 'text', true], ['nominee_name', 'text'], ['father_name', 'text'], ['mobile', 'tel'], ['address', 'textarea'], ['join_date', 'date'], ['status', 'active-status'], ['photo_path', 'photo']] },
  routes: { title: 'routes', fields: [['name', 'text', true, 'route_name'], ['charge_bdt', 'number', true, 'amount_bdt']] },
  buses: { title: 'buses', fields: [['registration_number', 'text', true], ['owner_id', 'owner', true], ['route_id', 'route'], ['driver_name', 'text'], ['driver_mobile', 'tel'], ['helper_name', 'text'], ['bus_type', 'text'], ['status', 'bus-status']] },
  members: { title: 'members', fields: [['name', 'text', true], ['father_name', 'text'], ['mobile', 'tel'], ['address', 'textarea'], ['membership_date', 'date', true], ['member_type', 'text'], ['status', 'active-status'], ['monthly_fee_bdt', 'number', true]] },
  funds: { title: 'funds', fields: [['name', 'text', true, 'fund_name'], ['route_id', 'route', true, 'route_name'], ['amount_bdt', 'number', true, 'perTripFundAmount']] },
  income_categories: { title: 'income_categories', fields: [['name', 'text', true], ['is_active', 'checkbox']] },
  expense_categories: { title: 'expense_categories', fields: [['name', 'text', true], ['is_active', 'checkbox']] }
};

const BUS_IMPORT_FIELDS = [
  { key: 'owner_name', labelKey: 'owner_name', required: true, aliases: [] },
  { key: 'bus_number', labelKey: 'registration_number', required: true, aliases: [] },
  { key: 'father_name', labelKey: 'father_name', required: true, aliases: [] },
  { key: 'mobile', labelKey: 'mobile', required: true, aliases: [] },
  { key: 'address', labelKey: 'address', aliases: [] },
  { key: 'status', labelKey: 'status', aliases: [] }
];

const FUND_IMPORT_FIELDS = [
  { key: 'fund_name', labelKey: 'fund_name', required: true },
  { key: 'route_name', labelKey: 'route_name', required: true },
  { key: 'per_trip_amount', labelKey: 'perTripFundAmount', required: true },
  { key: 'opening_balance', labelKey: 'openingBalance' },
  { key: 'status', labelKey: 'status' }
];

const BUS_IMPORT_COLUMNS = [
  {
    header: 'owner_name', missing: 'owner_name',
    cell: (row) => `${escapeHtml(row.owner_name)}${row.existing_owner_name ? `<small class="import-existing">${t('importExistingOwner')}: ${escapeHtml(row.existing_owner_name)}</small>` : ''}`
  },
  { header: 'registration_number', missing: 'bus_number', cell: (row) => escapeHtml(row.bus_number) },
  { header: 'father_name', cell: (row) => escapeHtml(row.father_name) },
  { header: 'mobile', cell: (row) => escapeHtml(row.mobile) },
  { header: 'address', cell: (row) => escapeHtml(row.address) },
  { header: 'status', cell: (row) => status(row.status) }
];

const FUND_IMPORT_COLUMNS = [
  { header: 'fund_name', missing: 'fund_name', cell: (row) => escapeHtml(row.fund_name) },
  { header: 'route_name', missing: 'route_name', cell: (row) => escapeHtml(row.route_name) },
  { header: 'perTripFundAmount', cell: (row) => formatMoney(row.per_trip_paisa) },
  { header: 'openingBalance', cell: (row) => formatMoney(row.opening_balance_paisa) },
  { header: 'status', cell: (row) => status(row.status) }
];

const IMPORT_KINDS = {
  buses: {
    api: () => window.somiti.busImport,
    fields: BUS_IMPORT_FIELDS,
    columns: BUS_IMPORT_COLUMNS,
    titleKey: 'importBusOwnerTitle',
    hintKey: 'importBusOwnerHint',
    errorTitle: 'Bus Owner Import Errors',
    errorRow: (item) => [item.owner_name, item.bus_number, item.father_name, item.mobile, item.address, item.status]
  },
  funds: {
    api: () => window.somiti.fundImport,
    fields: FUND_IMPORT_FIELDS,
    columns: FUND_IMPORT_COLUMNS,
    titleKey: 'importFundsTitle',
    hintKey: 'importFundsHint',
    errorTitle: 'Fund Import Errors',
    errorRow: (item) => [item.fund_name, item.route_name, (item.per_trip_paisa / 100).toFixed(2), (item.opening_balance_paisa / 100).toFixed(2), item.status]
  }
};

function normalizeImportMapping(mapping, fields = BUS_IMPORT_FIELDS) {
  const result = {};
  for (const field of fields) {
    const value = mapping?.[field.key];
    result[field.key] = value === null || value === undefined ? '' : value;
  }
  return result;
}

function importPreviewMessage(totals) {
  if (totals.valid) return t('importPreviewNote');
  if (totals.duplicate && !totals.invalid) return tf('importAllDuplicates', totals.duplicate);
  return t('importNoValidRecords');
}

function importResultLabel(result) {  const labels = {
    valid: t('importValidLabel'),
    duplicate: t('importDuplicateLabel'),
    invalid: t('importInvalidLabel'),
    failed: t('importFailedLabel'),
    Duplicate: t('importDuplicateLabel'),
    Invalid: t('importInvalidLabel'),
    Failed: t('importFailedLabel')
  };
  return labels[result] || result;
}

function importResultStatus(result) {
  if (result === 'valid') return 'active';
  if (result === 'duplicate') return 'inactive';
  return 'repair';
}

function t(key) { return words[state.language][key] || key; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function fileUrl(value) { return value ? `file:///${encodeURI(String(value).replace(/\\/g, '/'))}` : ''; }
function formatMoney(paisa) { return `৳ ${new Intl.NumberFormat(state.language === 'bn' ? 'bn-BD' : 'en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((Number(paisa) || 0) / 100)}`; }
function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 2700);
}
function setLanguage() {
  document.documentElement.lang = state.language;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('#language-toggle').textContent = state.language === 'en' ? 'বাংলা' : 'English';
}
function label(field) { return t(field); }
const MESSAGE_PATTERNS = [
  [/^Incorrect username or password\.$/, 'loginFailed'],
  [/^Please sign in first\.$/, 'pleaseSignIn'],
  [/^Initial setup has already been completed\.$/, 'setupDone'],
  [/^Administrator permission is required\.$/, 'adminOnly'],
  [/^Only an administrator can change association settings\.$/, 'adminSettingsOnly'],
  [/^Only an administrator can correct a saved transaction\.$/, 'adminCorrectOnly'],
  [/^Only an administrator can delete a transaction\.$/, 'adminDeleteOnly'],
  [/^Your account does not have permission to (manage|delete)_([a-z_]+)\.$/, 'noPermission', (action, entity) => [t(action === 'manage' ? 'manageAction' : 'deleteAction'), label(entity)],],
  [/^At least one active administrator must remain\.$/, 'oneAdminRequired'],
  [/^Invalid user role\.$/, 'invalidRole'],
  [/^Name, username, and a password of at least 8 characters are required\.$/, 'userFieldsRequired'],
  [/^New password must contain at least 8 characters\.$/, 'passwordShort'],
  [/^Current password is incorrect\.$/, 'currentPasswordWrong'],
  [/^User not found\.$/, 'userNotFound'],
  [/^Owner not found\.$/, 'ownerNotFound'],
  [/^Bus not found\.$/, 'busNotFound'],
  [/^Bus status must be Active or Inactive\.$/, 'busStatusInvalid'],
  [/^Route not found\.$/, 'routeNotFound'],
  [/^Fund not found\.$/, 'fundNotFound'],
  [/^Receipt not found\.$/, 'receiptNotFound'],
  [/^Transaction not found\.$/, 'transactionNotFound'],
  [/^Record not found\.$/, 'recordNotFound'],
  [/^Unknown record type\.$/, 'unknownRecord'],
  [/^Amount must be greater than zero\.$/, 'amountPositive'],
  [/^Amount cannot be negative\.$/, 'amountNegative'],
  [/^(\w+) must be a whole number\.$/, 'wholeNumber', (field) => [label(field)],],
  [/^UNIQUE constraint failed:/, 'duplicateValue'],
  [/FOREIGN KEY constraint failed/, 'recordInUse'],
  [/^CHECK constraint failed/, 'invalidValue'],
  [/^Cash Out cannot exceed the available cash balance\.$/, 'cashOutTooBig'],
  [/^This change would make available Cash In lower than the amount already paid out\.$/, 'cashInLowerThanCashOut'],
  [/^A valid Cash Out request key is required\.$/, 'cashOutRequestKeyRequired'],
  [/^This Cash Out request key was already used for a different entry\.$/, 'cashOutRequestKeyUsed'],
  [/^Only an administrator can edit a Cash Out entry\.$/, 'cashOutAdminEdit'],
  [/^Only an administrator can delete a Cash Out entry\.$/, 'cashOutAdminDelete'],
  [/^Only an administrator can clear Cash In entries\.$/, 'cashInAdminClear'],
  [/^Only an administrator can clear Cash Out entries\.$/, 'cashOutAdminClear'],
  [/^Delete all Cash Out entries before clearing Cash In\.$/, 'cashInClearBlocked'],
  [/^Cash Out entry not found\.$/, 'cashOutNotFound'],
  [/^Legacy Cash Out entries cannot be (edited|deleted)\.$/, 'legacyCashOutLocked'],
  [/^The selected fund is not assigned to this route\.$/, 'fundRouteMismatch'],
  [/^Choose only funds assigned to this route\.$/, 'fundRouteMismatch'],
  [/^This route has no assigned funds\. Add funds in Fund Management first\.$/, 'noFundsForRoute'],
  [/^Select at least one assigned fund\.$/, 'selectAtLeastOneFund'],
  [/^This Cash Out entry belongs to a multi-fund batch\. Edit the batch instead\.$/, 'cashOutBatchEditRequired'],
  [/^The selected fund does not have a valid per-trip amount\.$/, 'fundPerTripRequired'],
  [/^Choose an active route with a valid per-trip amount\.$/, 'chooseActiveRouteAmount'],
  [/^Choose an active route\.$/, 'chooseActiveRoute'],
  [/^Total trips must be greater than zero\.$/, 'tripsPositive'],
  [/^A valid Cash In request key is required\.$/, 'cashInRequestKeyRequired'],
  [/^This Cash In request key was already used for a different entry\.$/, 'cashInRequestKeyUsed'],
  [/^Only an administrator can edit a Cash In entry\.$/, 'cashInAdminEdit'],
  [/^Only an administrator can delete a Cash In entry\.$/, 'cashInAdminDelete'],
  [/^Cash In entry not found\.$/, 'cashInNotFound'],
  [/^Bank name is required\.$/, 'bankNameRequired'],
  [/^Account number is required\.$/, 'accountNumberRequired'],
  [/^Opening balance must be zero or greater\.$/, 'openingBalanceInvalid'],
  [/^This account number is already registered\.$/, 'accountNumberUsed'],
  [/^This bank has deposits recorded\. Delete those deposits before deleting the bank\.$/, 'bankHasDeposits'],
  [/^Choose a valid bank account\.$/, 'chooseBank'],
  [/^Deposit amount must be greater than zero\.$/, 'depositAmountPositive'],
  [/^Bank transaction ID \/ slip number is required\.$/, 'txnRequired'],
  [/^This transaction ID is already recorded for the selected bank\.$/, 'txnDuplicate'],
  [/^Deposit cannot exceed the fund's available balance \((.*)\)\.$/, 'depositTooBig', (amount) => [amount]],
  [/^Bank not found\.$/, 'bankNotFound'],
  [/^Bank Deposit not found\.$/, 'depositNotFound'],
  [/^Only an administrator can edit a Bank Deposit\.$/, 'depositAdminEdit'],
  [/^Only an administrator can delete a Bank Deposit\.$/, 'depositAdminDelete'],
  [/^Total trips must be a whole number\.$/, 'wholeNumber', () => [t('totalTrips')]],
  [/^Route name is required\.$/, 'routeNameRequired'],
  [/^Fund name is required\.$/, 'fundNameRequired'],
  [/^Choose a route for this fund\.$/, 'fundRouteRequired'],
  [/^Choose an active fund\.$/, 'chooseActiveFund'],
  [/^Enter a valid transaction date\.$/, 'validDateRequired'],
  [/^Choose a different database file\.$/, 'chooseDifferentFile'],
  [/^Only the configured backup folder can be opened\.$/, 'backupFolderOnly'],
  [/^Backup integrity check failed: (.*)$/, 'backupCheckFailed', (detail) => [detail],],
  [/^Backup is missing required table: (\w+)$/, 'backupMissingTable', (table) => [table],]
];

function tf(key, ...args) {
  return t(key).replace(/\{(\d+)\}/g, (match, index) => args[Number(index)] ?? match);
}

function explain(message) {
  const text = String(message || '').trim();
  for (const entry of MESSAGE_PATTERNS) {
    const found = text.match(entry[0]);
    if (!found) continue;
    const args = entry[2] ? entry[2](...found.slice(1)) : found.slice(1);
    return tf(entry[1], ...args);
  }
  return text;
}
function nav() {
  $('#navigation').innerHTML = menu.filter(([page]) => page !== 'users' || state.user?.role === 'admin')
    .map(([page, icon]) => `<button class="nav-link ${state.page === page ? 'active' : ''}" data-page="${page}"><span class="nav-icon">${icon}</span>${escapeHtml(t(page))}</button>`).join('');
  $$('#navigation [data-page]').forEach((button) => button.addEventListener('click', () => renderPage(button.dataset.page)));
}

async function showAuth() {
  $('#app').hidden = true;
  $('#auth').hidden = false;
  const setupNeeded = !(await window.somiti.auth.status());
  $('#auth-title').textContent = setupNeeded ? t('setup') : t('brand');
  $('#auth-description').textContent = setupNeeded ? t('setupPrompt') : t('signInPrompt');
  $('#auth-form').innerHTML = `${setupNeeded ? `<div class="field"><label>${t('full_name')}</label><input name="full_name" required></div>` : ''}
    <div class="field"><label>${t('username')}</label><input name="username" required autocomplete="username"></div>
    ${setupNeeded ? `<div class="field"><label>${t('password')}</label><input name="password" type="password" required minlength="8" autocomplete="new-password"></div>` :
      `<div class="field"><label>${t('password')}</label><input name="password" type="password" required autocomplete="current-password"></div>`}
    <button class="button button-primary" type="submit">${setupNeeded ? t('setup') : t('login')}</button>`;
  $('#auth-error').textContent = '';
  $('#auth-form').onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      state.user = setupNeeded ? await window.somiti.auth.setup(data) : await window.somiti.auth.login(data);
      $('#auth').hidden = true;
      $('#app').hidden = false;
      await initializeApp();
    } catch (error) { $('#auth-error').textContent = explain(error.message); }
  };
}

async function initializeApp() {
  $('#user-label').textContent = `${state.user.full_name} · ${state.user.role === 'admin' ? t('administrator') : t('staff')}`;
  setLanguage();
  await loadLookups();
  await renderPage(state.page);
}

async function loadLookups() {
  const [owners, buses, routes, funds, members] = await Promise.all([
    window.somiti.records.list('owners'), window.somiti.records.list('buses'),
    window.somiti.records.list('routes'), window.somiti.records.list('funds'),
    window.somiti.records.list('members')
  ]);
  Object.assign(state, { owners, buses, routes, funds: funds.filter((fund) => fund.is_active), members });
}

function card(title, value, icon, note = '') {
  return `<div class="metric-card"><span class="metric-icon">${icon}</span><div class="metric-title">${escapeHtml(title)}</div><div class="metric-value">${escapeHtml(value)}</div><div class="metric-note">${escapeHtml(note)}</div></div>`;
}

async function renderDashboard() {
  const [data, cashbook] = await Promise.all([window.somiti.dashboard.get(), window.somiti.cashbook.get()]);
  const values = data.totals;
  const totalFundBalance = cashbook.funds.reduce((total, fund) => total + fund.balance_paisa, 0);
  const max = Math.max(1, ...cashbook.funds.map((fund) => fund.balance_paisa));
  const fundRows = cashbook.funds.map((fund) => `<div class="fund-row"><span class="fund-dot"></span>${escapeHtml(fund.name)}<strong>${formatMoney(fund.balance_paisa)}</strong></div>`).join('');
  const activity = [
    ...cashbook.income.map((item) => ({
      date: item.date, created_at: item.created_at,
      type: item.cash_in_type === 'Holiday' ? t('holidayCashIn') : t('cashIn'),
      detail: item.route_name, amount: item.total_amount_paisa
    })),
    ...cashbook.cashOuts.map((item) => ({ date: item.date, created_at: item.created_at, type: t('cashOut'), detail: [item.route_name, item.fund_name].filter(Boolean).join(' · '), amount: item.amount_paisa }))
  ].sort((a, b) => String(b.created_at || b.date).localeCompare(String(a.created_at || a.date))).slice(0, 8);
  const activityRows = activity.map((item) => [escapeHtml(item.date), escapeHtml(item.type), escapeHtml(item.detail || '—'), formatMoney(item.amount)]);
  const cards = [
    [t('totalBuses'), values.buses, '▣'], [t('totalActiveBuses'), values.active_buses, '✓'], [t('totalInactiveBuses'), values.inactive_buses, '⏸'],
    [t('totalOwners'), values.owners, '♙'], [t('totalRoutes'), values.routes, '⇄'], [t('totalMembers'), values.members, '♧'],
    [t('totalRegularCashIn'), formatMoney(cashbook.totals.regular_cash_in_paisa), '↗'],
    [t('totalHolidayCashIn'), formatMoney(cashbook.totals.holiday_cash_in_paisa), '☼'],
    [t('totalCashIn'), formatMoney(cashbook.totals.cash_in_paisa), '↗'], [t('totalCashOut'), formatMoney(cashbook.totals.cash_out_paisa), '↘'],
    [t('availableCash'), formatMoney(cashbook.totals.available_paisa), '৳'], [t('fundBalance'), formatMoney(totalFundBalance), '◉']
  ];
  $('#content').innerHTML = `<div class="cards">${cards.map((item) => card(...item)).join('')}</div>
    <div class="dashboard-grid"><div class="panel"><div class="panel-heading"><h2>${t('cashbook')}</h2><button class="button button-outline button-small" data-go="cashbook">${t('cashbook')}</button></div>
      ${activityRows.length ? table([t('date'), t('transaction_type'), t('route'), t('amount_bdt')], activityRows) : `<div class="empty">${t('noRows')}</div>`}</div>
      <div class="panel"><div class="panel-heading"><h2>${t('fundsSummary')}</h2></div>${fundRows || `<div class="empty">${t('noRows')}</div>`}
      <div class="chart">${cashbook.funds.map((fund) => {
        const bucket = fund.balance_paisa <= 0 ? 0 : Math.min(10, Math.max(1, Math.ceil(fund.balance_paisa / max * 10)));
        return `<div class="chart-column" title="${escapeHtml(fund.name)}: ${formatMoney(fund.balance_paisa)}"><div class="chart-bar chart-bar-${bucket}"></div><span class="chart-label">${escapeHtml(fund.name.slice(0, 8))}</span></div>`;
      }).join('')}</div></div></div>`;
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => renderPage(button.dataset.go)));
}

function table(headers, rows, actions = null, className = '') {
  if (!rows.length) return `<div class="empty">${t('noRows')}</div>`;
  const cls = className ? ` class="${className}"` : '';
  return `<div class="table-wrap"><table${cls}><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}${actions ? `<th>${t('actions')}</th>` : ''}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}${actions ? `<td>${actions(row)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

function ownerName(id) { return state.owners.find((item) => Number(item.id) === Number(id))?.name || '—'; }
function routeName(id) { return state.routes.find((item) => Number(item.id) === Number(id))?.name || '—'; }
function busName(id) { return state.buses.find((item) => Number(item.id) === Number(id))?.registration_number || '—'; }
function memberName(id) { return state.members.find((item) => Number(item.id) === Number(id))?.name || '—'; }
function statusLabel(value) {
  const translationKey = { Active: 'active', Inactive: 'inactive', Repair: 'repair', Success: 'success', Failed: 'failed' }[value];
  return translationKey ? t(translationKey) : value;
}
function status(value) {
  return `<span class="status ${String(value).toLowerCase()}">${escapeHtml(statusLabel(value))}</span>`;
}
function statusSelect(field, labelText, values, value) {
  const selected = value || values[0];
  const choices = values.includes(selected) ? values : [selected, ...values];
  const options = choices.map((item) => `<option value="${item}" ${item === selected ? 'selected' : ''}>${statusLabel(item)}</option>`).join('');
  return `<div class="field"><label>${labelText}</label><select name="${field}">${options}</select></div>`;
}
function standardColumns(entity) {
  const columns = {
    owners: [['owner_code', 'owner_code'], ['name', 'name'], ['mobile', 'mobile'], ['nominee_name', 'nominee_name'], ['join_date', 'join_date'], ['status', 'status'], ['address', 'address']],
    routes: [['name', 'route_name'], ['charge_paisa', 'amount_bdt']],
    buses: [['registration_number', 'registration_number'], ['owner_id', 'owner_id'], ['route_id', 'route_id'], ['bus_type', 'bus_type'], ['driver_name', 'driver_name'], ['driver_mobile', 'driver_mobile'], ['status', 'status']],
    members: [['member_code', 'member_code'], ['name', 'name'], ['father_name', 'father_name'], ['mobile', 'mobile'], ['member_type', 'member_type'], ['monthly_fee_paisa', 'monthly_fee_bdt'], ['status', 'status']],
    funds: [['name', 'fund_name'], ['route_id', 'route_name'], ['amount_paisa', 'perTripFundAmount'], ['opening_balance_paisa', 'openingBalance'], ['balance_paisa', 'currentBalance']],
    income_categories: [['name', 'name'], ['is_active', 'is_active']],
    expense_categories: [['name', 'name'], ['is_active', 'is_active']]
  };
  return columns[entity];
}
function displayValue(entity, row, field) {
  const value = row[field];
  if (field === 'owner_id') return escapeHtml(ownerName(value));
  if (field === 'route_id') return escapeHtml(routeName(value));
  if (field.endsWith('_paisa')) return formatMoney(value);
  if (field === 'is_active') return value ? t('active') : t('inactive');
  if (field === 'status') return status(value);
  if (field === 'address' && value?.length > 32) return `${escapeHtml(value.slice(0, 32))}…`;
  return escapeHtml(value || '—');
}

async function renderBusList() {
  const columns = standardColumns('buses');
  const routeOptions = [...state.routes].sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((route) => `<option value="${route.id}" ${String(state.busFilters.route_id) === String(route.id) ? 'selected' : ''}>${escapeHtml(route.name)}</option>`).join('');
  $('#content').innerHTML = `<div class="toolbar bus-toolbar">
    <input id="bus-search" class="search" placeholder="${t('busListSearch')}" value="${escapeHtml(state.search)}">
    <select id="bus-route-filter" class="filter-select" aria-label="${t('route_id')}"><option value="">${t('allRoutes')}</option>${routeOptions}</select>
    <select id="bus-status-filter" class="filter-select" aria-label="${t('status')}">
      <option value="">${t('allStatuses')}</option>
      <option value="Active" ${state.busFilters.status === 'Active' ? 'selected' : ''}>${t('activeOnly')}</option>
      <option value="Inactive" ${state.busFilters.status === 'Inactive' ? 'selected' : ''}>${t('inactiveOnly')}</option>
    </select>
    <span class="spacer"></span><button id="import-buses" class="button button-outline">⇧ ${t('importExcel')}</button>
    <button id="add-record" class="button button-primary">＋ ${t('add')}</button>
  </div><div id="bus-results"><div class="panel empty">${t('loading')}</div></div>`;
  let request = 0;
  const load = async () => {
    const current = ++request;
    const records = await window.somiti.records.list('buses', state.search, state.busFilters);
    if (current !== request) return;
    const tableRows = records.map((record) => `<tr class="${record.status === 'Active' ? '' : 'bus-row-inactive'}">
      ${columns.map(([field]) => `<td>${displayValue('buses', record, field)}</td>`).join('')}
      <td><div class="action-cell">
        <button class="button button-outline button-small" data-toggle-bus-status="${record.id}" data-next-status="${record.status === 'Active' ? 'Inactive' : 'Active'}">${record.status === 'Active' ? t('deactivate') : t('activate')}</button>
        <button class="button button-outline button-small" data-account-entity="buses" data-account-id="${record.id}">${t('account')}</button>
        <button class="button button-outline button-small" data-edit="${record.id}">${t('edit')}</button>
        <button class="button button-danger button-small" data-delete="${record.id}">${t('delete')}</button>
      </div></td></tr>`).join('');
    $('#bus-results').innerHTML = records.length
      ? `<div class="table-wrap"><table><thead><tr>${columns.map(([, title]) => `<th>${escapeHtml(label(title))}</th>`).join('')}<th>${t('actions')}</th></tr></thead><tbody>${tableRows}</tbody></table></div>`
      : `<div class="panel empty">${t('noRows')}</div>`;
    $$('[data-toggle-bus-status]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await window.somiti.buses.setStatus(Number(button.dataset.toggleBusStatus), button.dataset.nextStatus);
        toast(t('busStatusSaved'));
        await loadLookups();
        await load();
      } catch (error) {
        button.disabled = false;
        toast(explain(error.message));
      }
    }));
    $$('[data-account-entity]').forEach((button) => button.addEventListener('click', () => showAccount(button.dataset.accountEntity, Number(button.dataset.accountId))));
    $$('[data-edit]').forEach((button) => button.addEventListener('click', () => openRecordForm('buses', records.find((record) => record.id === Number(button.dataset.edit)))));
    $$('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm(t('confirmDelete'))) return;
      try { await window.somiti.records.delete('buses', Number(button.dataset.delete)); await loadLookups(); toast(t('saved')); await load(); }
      catch (error) { toast(explain(error.message)); }
    }));
  };
  const search = $('#bus-search');
  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    state.search = search.value;
    searchTimer = setTimeout(load, 140);
  });
  $('#bus-route-filter').addEventListener('change', (event) => { state.busFilters.route_id = event.target.value; load(); });
  $('#bus-status-filter').addEventListener('change', (event) => { state.busFilters.status = event.target.value; load(); });
  $('#import-buses').addEventListener('click', () => openImport('buses'));
  $('#add-record').addEventListener('click', () => openRecordForm('buses'));
  await load();
}

async function renderEntity(entity) {
  if (entity === 'buses') return renderBusList();
  const cfg = entityConfig[entity];
  const records = await window.somiti.records.list(entity, state.search);
  if (entity === 'funds') state.funds = records.filter((fund) => fund.is_active);
  const columns = standardColumns(entity);
  const tableRows = records.map((record) => `<tr>${columns.map(([field]) => `<td>${displayValue(entity, record, field)}</td>`).join('')}<td><div class="action-cell">${['owners', 'buses', 'routes'].includes(entity) ? `<button class="button button-outline button-small" data-account-entity="${entity}" data-account-id="${record.id}">${t('account')}</button>` : ''}<button class="button button-outline button-small" data-edit="${record.id}">${t('edit')}</button><button class="button button-danger button-small" data-delete="${record.id}">${t('delete')}</button></div></td></tr>`).join('');
  $('#content').innerHTML = `<div class="toolbar"><input id="entity-search" class="search" placeholder="${t('search')}" value="${escapeHtml(state.search)}"><span class="spacer"></span>${['owners', 'funds'].includes(entity) ? `<button id="import-entity" class="button button-outline">⇧ ${t('importExcel')}</button>` : ''}<button id="add-record" class="button button-primary">＋ ${t('add')}</button></div>
    ${records.length ? `<div class="table-wrap"><table><thead><tr>${columns.map(([, title]) => `<th>${escapeHtml(label(title))}</th>`).join('')}<th>${t('actions')}</th></tr></thead><tbody>${tableRows}</tbody></table></div>` : `<div class="panel empty">${t('noRows')}</div>`}`;
  const search = $('#entity-search');
  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    state.search = search.value;
    searchTimer = setTimeout(() => renderEntity(entity), 180);
  });
  $('#add-record').addEventListener('click', () => openRecordForm(entity));
  $('#import-entity')?.addEventListener('click', () => openImport(entity === 'funds' ? 'funds' : 'buses'));
  $$('[data-edit]').forEach((button) => button.addEventListener('click', () => openRecordForm(entity, records.find((record) => record.id === Number(button.dataset.edit)))));
  $$('[data-account-entity]').forEach((button) => button.addEventListener('click', () => showAccount(button.dataset.accountEntity, Number(button.dataset.accountId))));
  $$('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm(t('confirmDelete'))) return;
    try { await window.somiti.records.delete(entity, Number(button.dataset.delete)); await loadLookups(); toast(t('saved')); renderEntity(entity); }
    catch (error) { toast(explain(error.message)); }
  }));
}

function emptyBlock() { return `<div class="empty">${t('noRows')}</div>`; }
function dataTable(headers, rowsHtml) {
  return rowsHtml ? `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div>` : emptyBlock();
}
function ledgerRows(payments) {
  const rows = payments.map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.category)}</td><td>${item.transaction_type === 'income' ? t('typeIncome') : t('typeExpense')}</td><td>${escapeHtml(item.fund_name || '—')}</td><td>${formatMoney(item.amount_paisa)}</td><td>${escapeHtml(item.description || '')}</td></tr>`).join('');
  return dataTable([t('date'), t('category'), t('transaction_type'), t('fund_id'), t('amount_bdt'), t('description_label')], rows);
}

async function showAccount(entity, id) {
  try {
    if (entity === 'buses') {
      const { bus, payments } = await window.somiti.buses.account(id);
      const summary = [bus.route_name, bus.bus_type, bus.driver_name, bus.driver_mobile].filter(Boolean).join(' · ');
      showAccountDialog(`${bus.registration_number} · ${bus.owner_name}`, `<p class="subheading">${escapeHtml(summary || '—')} · ${status(bus.status)}</p>
        <h3>${t('ledger')}</h3>${ledgerRows(payments)}`);
      return;
    }
    if (entity === 'routes') {
      const { route, buses, funds } = await window.somiti.routes.account(id);
      const rows = buses.map((bus) => `<tr><td>${escapeHtml(bus.registration_number)}</td><td>${escapeHtml(bus.owner_name)}</td><td>${status(bus.status)}</td></tr>`).join('');
      const fundRows = funds.map((fund) => `<tr><td>${escapeHtml(fund.name)}</td><td>${formatMoney(fund.amount_paisa)}</td><td>${status(fund.is_active ? 'Active' : 'Inactive')}</td></tr>`).join('');
      showAccountDialog(route.name, `<p class="subheading">${t('amount_bdt')}: ${formatMoney(route.charge_paisa)}</p>
        <h3>${t('funds')}</h3>${dataTable([t('fund_id'), t('perTripFundAmount'), t('status')], fundRows)}
        <h3>${t('buses')}</h3>${dataTable([t('registration_number'), t('owner_id'), t('status')], rows)}`);
      return;
    }
    const account = await window.somiti.owners.account(id);
    const owner = account.owner;
    const busRows = account.buses.map((bus) => `<tr><td>${escapeHtml(bus.registration_number)}</td><td>${escapeHtml(bus.route_name || '—')}</td><td>${status(bus.status)}</td></tr>`).join('');
    const cards = `<div class="cards">${card(t('buses'), account.buses.length, '▣')}${card(t('typeIncome'), formatMoney(account.totals.income), '৳')}${card(t('typeExpense'), formatMoney(account.totals.expense), '↘')}${card(t('total'), formatMoney(account.totals.income - account.totals.expense), '◈')}</div>`;
    const summary = [owner.mobile, owner.address, owner.join_date].filter(Boolean).join(' · ');
    showAccountDialog(`${owner.name} · ${owner.owner_code}`, `<p class="subheading">${escapeHtml(summary || '—')} · ${status(owner.status)}</p>${cards}
      <h3>${t('buses')}</h3>${dataTable([t('registration_number'), t('route_id'), t('status')], busRows)}
      <h3>${t('ledger')}</h3>${ledgerRows(account.payments)}
      <div class="modal-actions"><button class="button button-outline" id="print-owner">${t('printOwner')}</button></div>`);
    $('#print-owner').addEventListener('click', async () => {
      const headers = [t('owner_code'), t('name'), t('mobile'), t('address'), t('buses'), t('typeIncome'), t('typeExpense')];
      const rows = [[owner.owner_code, owner.name, owner.mobile, owner.address, account.buses.length, account.totals.income, account.totals.expense]];
      try { await window.somiti.export.pdf({ title: `${t('owners')} · ${owner.name}`, headers, rows }); }
      catch (error) { toast(explain(error.message)); }
    });
  } catch (error) { toast(explain(error.message)); }
}
function showAccountDialog(title, body) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="modal"><h2>${escapeHtml(title)}</h2>${body}<div class="modal-actions"><button class="button button-outline" data-cancel>${t('cancel')}</button></div></div>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
}

function optionsHtml(options, selected, title) {
  return `<option value="">${escapeHtml(title)}</option>${options.map((item) => `<option value="${item.id}" ${String(selected ?? '') === String(item.id) ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}`;
}
function fieldControl(field, kind, required, value, record, title) {
  const labelText = label(title || field);
  const req = required ? 'required' : '';
  const full = kind === 'textarea' || kind === 'photo' ? ' full' : '';
  if (kind === 'owner') return `<div class="field"><label>${labelText}</label><select name="${field}" ${req}>${optionsHtml(state.owners.map((item) => ({ id: item.id, label: `${item.owner_code} — ${item.name}` })), value, t('selectOwner'))}</select></div>`;
  if (kind === 'route') return `<div class="field"><label>${labelText}</label><select name="${field}" ${req}>${optionsHtml(state.routes.map((item) => ({ id: item.id, label: `${item.route_number} — ${item.name}` })), value, t('selectRoute'))}</select></div>`;
  if (kind === 'bus-status') return statusSelect(field, labelText, ['Active', 'Inactive'], value);
  if (kind === 'active-status') return statusSelect(field, labelText, ['Active', 'Inactive'], value);
  if (kind === 'checkbox') return `<div class="field"><label><input name="${field}" type="checkbox" ${value === undefined || value ? 'checked' : ''}> ${labelText}</label></div>`;
  if (kind === 'photo') return `<div class="field full"><label>${labelText}</label><input name="photo_path" value="${escapeHtml(value || '')}" readonly><button type="button" class="button button-outline" id="photo-pick">${t('choose')}</button></div>`;
  if (kind === 'textarea') return `<div class="field${full}"><label>${labelText}</label><textarea name="${field}" ${req}>${escapeHtml(value || '')}</textarea></div>`;
  let inputValue = value ?? '';
  if (field === 'charge_bdt' && record) inputValue = (Number(record.charge_paisa) / 100).toFixed(2);
  if (field === 'opening_balance_bdt' && record) inputValue = (Number(record.opening_balance_paisa) / 100).toFixed(2);
  if (field === 'monthly_fee_bdt' && record) inputValue = (Number(record.monthly_fee_paisa) / 100).toFixed(2);
  if (kind === 'date' && !inputValue) inputValue = today();
  return `<div class="field"><label>${labelText}</label><input name="${field}" type="${kind}" value="${escapeHtml(inputValue)}" ${kind === 'number' ? 'min="0" step="0.01"' : ''} ${req}></div>`;
}

async function openRecordForm(entity, record = {}) {
  const cfg = entityConfig[entity];
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${record.id ? t('edit') : t('add')} · ${t(cfg.title)}</h2><div class="form-grid">
    ${cfg.fields.map(([field, kind, required, title]) => fieldControl(field, kind, required, record[field], record, title)).join('')}
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button type="submit" class="button button-primary">${t('save')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  $('#photo-pick', modal)?.addEventListener('click', async () => {
    if (!record.id) { toast(t('photoNeedsSave')); return; }
    const photo = await window.somiti.files.ownerPhoto(record.owner_code || record.id);
    if (photo) $('[name="photo_path"]', modal).value = photo;
  });
  modal.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.id = record.id || undefined;
    for (const [source, target] of [['charge_bdt', 'charge_paisa'], ['opening_balance_bdt', 'opening_balance_paisa'], ['monthly_fee_bdt', 'monthly_fee_paisa'], ['amount_bdt', 'amount_paisa']]) {
      if (data[source] !== undefined) { data[target] = Math.round(Number(data[source]) * 100); delete data[source]; }
    }
    if (entity.endsWith('_categories') || (entity === 'funds' && event.currentTarget.elements.is_active)) {
      data.is_active = event.currentTarget.elements.is_active.checked;
    }
    try {
      await window.somiti.records.save(entity, data);
      modal.remove();
      await loadLookups();
      toast(t('saved'));
      await renderEntity(entity);
    } catch (error) { submit.disabled = false; toast(explain(error.message)); }
  });
}

async function openImport(kind) {
  const config = IMPORT_KINDS[kind];
  const api = config.api();
  let session = null;
  let headers = [];
  let mapping = {};
  let preview = null;
  let result = null;
  let mode = 'upload';
  let busy = false;
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  $('#modal-root').replaceChildren(modal);

  const close = async () => {
    modal.remove();
    if (session) {
      const id = session.id;
      session = null;
      try { await api.cancel({ id }); } catch (error) { /* session already cleared */ }
    }
  };

  const statCard = (titleText, value, tone = '') => `<div class="import-stat ${tone}"><span>${escapeHtml(titleText)}</span><strong>${value}</strong></div>`;
  const isMapped = (key) => mapping[key] !== '' && mapping[key] !== null && mapping[key] !== undefined;
  const readMapping = () => {
    $$('[data-map-field]', modal).forEach((select) => {
      mapping[select.dataset.mapField] = select.value === '' ? '' : Number(select.value);
    });
  };
  const tableHead = `<th>${t('importRow')}</th>${config.columns.map((column) => `<th>${escapeHtml(t(column.header))}</th>`).join('')}<th>${t('result')}</th><th>${t('importReason')}</th>`;
  const bodyCell = (row, column) => {
    const missing = column.missing && (row.missing || []).includes(column.missing) ? ' class="import-missing"' : '';
    return `<td${missing}>${column.cell(row)}</td>`;
  };

  const pickFile = async () => {
    if (busy) return;
    busy = true;
    try {
      const picked = await api.pick();
      if (!picked) return;
      session = picked;
      headers = picked.headers || [];
      mapping = normalizeImportMapping(picked.mapping, config.fields);
      preview = null;
      result = null;
      mode = 'mapping';
      render();
    } catch (error) {
      toast(`${t('importFailed')}: ${explain(error.message)}`);
    } finally {
      busy = false;
    }
  };

  const downloadTemplate = async () => {
    try {
      const filePath = await api.template();
      if (filePath) toast(`${t('importTemplateSaved')} ${filePath}`);
    } catch (error) {
      toast(explain(error.message));
    }
  };

  const loadPreview = async () => {
    if (!session) { toast(t('importNoFile')); return; }
    readMapping();
    if (!config.fields.filter((field) => field.required).every((field) => isMapped(field.key))) {
      toast(t('importMappingRequiredError'));
      return;
    }
    if (busy) return;
    busy = true;
    try {
      preview = await api.preview({ id: session.id, mapping });
      mode = 'preview';
    } catch (error) {
      toast(`${t('importFailed')}: ${explain(error.message)}`);
    } finally {
      busy = false;
      render();
    }
  };

  const commitImport = async () => {
    if (!session || !preview || busy) return;
    if (!preview.totals.valid) {
      toast(importPreviewMessage(preview.totals));
      return;
    }
    busy = true;
    render();
    try {
      result = await api.commit({ id: session.id, mapping });
      session = null;
      preview = null;
      mode = 'result';
      toast(result.totals.imported
        ? tf('importSavedSummary', result.totals.imported)
        : t('importNoneSaved'));
      try {
        await loadLookups();
        await renderPage(state.page);
      } catch (error) { toast(explain(error.message)); }
    } catch (error) {
      // The save really failed: keep the preview so the rows can be reviewed
      // and retried, and show exactly what the database said.
      toast(`${t('importFailed')}: ${explain(error.message)}`);
      try {
        preview = await api.preview({ id: session.id, mapping });
      } catch (refreshError) { /* keep the previous preview */ }
    } finally {
      busy = false;
      render();
    }
  };

  const downloadErrors = async () => {
    if (!result || !result.issues.length) return;
    try {
      const filePath = await window.somiti.export.excel({
        title: config.errorTitle,
        headers: [t('importRow'), ...config.columns.map((column) => t(column.header)), t('result'), t('importReason')],
        rows: result.issues.map((issue) => [issue.row, ...config.errorRow(issue), importResultLabel(issue.result), issue.reason])
      });
      if (filePath) toast(filePath);
    } catch (error) {
      toast(explain(error.message));
    }
  };

  const renderMapping = () => {
    const mappingFields = config.fields.map((field) => {
      const options = headers.map((header, index) => `<option value="${index}" ${String(mapping[field.key]) === String(index) ? 'selected' : ''}>${escapeHtml(header)}</option>`).join('');
      return `<label class="import-map-field">
        <span>${escapeHtml(t(field.labelKey))} ${field.required ? '<b class="import-required">*</b>' : ''}</span>
        <select data-map-field="${field.key}"><option value="">${t('notMapped')}</option>${options}</select>
      </label>`;
    }).join('');
    return `<h2>${t(config.titleKey)}</h2><p class="subheading">${t(config.hintKey)}</p>
      <div class="import-actions">
        <button type="button" class="button button-primary" data-import-pick>⇧ ${t('chooseExcelFile')}</button>
        <button type="button" class="button button-outline" data-import-template>⤓ ${t('downloadTemplate')}</button>
      </div>
      ${session ? `<div class="import-file">${t('importSelectedFile')}: <strong>${escapeHtml(session.fileName)}</strong> · ${t('importSheet')}: ${escapeHtml(session.sheetName)} · ${session.total} ${t('importRowsDetected')}</div>` : ''}
      ${headers.length ? `<h3>${t('importMappingTitle')}</h3><p class="muted">${t('importMappingHint')}</p>
        <div class="import-mapping">${mappingFields}</div>` : ''}
      <div class="modal-actions">
        <button type="button" class="button button-outline" data-cancel>${t('cancel')}</button>
        ${headers.length ? `<button type="button" class="button button-primary" data-preview>${t('previewImport')}</button>` : ''}
      </div>`;
  };

  const renderPreview = () => {
    const rows = preview.rows.map((row) => `<tr class="${row.result === 'valid' ? '' : 'bus-row-inactive'}">
      <td>${row.row}</td>
      ${config.columns.map((column) => bodyCell(row, column)).join('')}
      <td><span class="status ${importResultStatus(row.result)}">${escapeHtml(importResultLabel(row.result))}</span></td>
      <td>${escapeHtml(row.reasons.join('; '))}</td>
    </tr>`).join('');
    return `<h2>${t('importPreviewTitle')}</h2>
      <p class="subheading">${escapeHtml(session.fileName)} · ${t('importSheet')}: ${escapeHtml(session.sheetName)}</p>
      <div class="import-stats">
        ${statCard(t('totalExcelRows'), preview.totals.total)}
        ${statCard(t('validRecords'), preview.totals.valid, 'valid')}
        ${statCard(t('duplicateRecords'), preview.totals.duplicate, 'duplicate')}
        ${statCard(t('invalidRecords'), preview.totals.invalid, 'invalid')}
      </div>
      <p class="${preview.totals.valid ? 'muted' : 'error-text'}">${escapeHtml(importPreviewMessage(preview.totals))}</p>
      <div class="table-wrap import-preview"><table><thead><tr>${tableHead}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="modal-actions">
        <button type="button" class="button button-outline" data-back>${t('backToMapping')}</button>
        <button type="button" class="button button-outline" data-cancel>${t('cancel')}</button>
        <button type="button" class="button button-primary" data-commit ${preview.totals.valid && !busy ? '' : 'disabled'}>${busy && preview.totals.valid ? `<span class="import-spinner" aria-hidden="true"></span>${t('loading')}` : t('importValidRecords')}</button>
      </div>`;
  };

  const renderResult = () => {
    const issues = result.issues.map((issue) => `<tr>
      <td>${issue.row}</td>
      ${config.columns.map((column) => bodyCell(issue, column)).join('')}
      <td><span class="status ${importResultStatus(issue.result)}">${escapeHtml(importResultLabel(issue.result))}</span></td>
      <td>${escapeHtml(issue.reason)}</td>
    </tr>`).join('');
    return `<h2>${t('importResultTitle')}</h2>
      <div class="import-stats">
        ${statCard(t('totalExcelRows'), result.totals.total)}
        ${statCard(t('importedRecords'), result.totals.imported, 'valid')}
        ${statCard(t('duplicateRecords'), result.totals.duplicates, 'duplicate')}
        ${statCard(t('failedRecords'), result.totals.failed, 'invalid')}
      </div>
      ${result.issues.length ? `<div class="table-wrap import-preview"><table><thead><tr>${tableHead}</tr></thead><tbody>${issues}</tbody></table></div>` : `<div class="empty">${t('importNoIssues')}</div>`}
      <div class="modal-actions">
        ${result.issues.length ? `<button type="button" class="button button-outline" data-errors>${t('downloadErrorExcel')}</button>` : ''}
        <button type="button" class="button button-primary" data-close>${t('close')}</button>
      </div>`;
  };

  function render() {
    let body = '';
    if (mode === 'result' && result) body = renderResult();
    else if (mode === 'preview' && preview) body = renderPreview();
    else body = renderMapping();
    modal.innerHTML = `<div class="modal modal-wide import-modal">${body}</div>`;
    $('[data-cancel]', modal)?.addEventListener('click', close);
    $('[data-close]', modal)?.addEventListener('click', close);
    $('[data-import-pick]', modal)?.addEventListener('click', pickFile);
    $('[data-import-template]', modal)?.addEventListener('click', downloadTemplate);
    $$('[data-map-field]', modal).forEach((select) => select.addEventListener('change', () => readMapping()));
    $('[data-preview]', modal)?.addEventListener('click', loadPreview);
    $('[data-back]', modal)?.addEventListener('click', () => { mode = 'mapping'; preview = null; render(); });
    $('[data-commit]', modal)?.addEventListener('click', commitImport);
    $('[data-errors]', modal)?.addEventListener('click', downloadErrors);
  }

  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  render();
}

function renderCustomTable(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((item) => `<td>${item}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function selectField(name, title, options, required = true, selected = '') {
  return `<div class="field"><label>${title}</label><select name="${name}" ${required ? 'required' : ''}>${optionsHtml(options, selected, t('other'))}</select></div>`;
}

function assignedFundsForRoute(data, routeId) {
  return data.funds.filter((fund) => fund.route_id === Number(routeId) && fund.amount_paisa > 0);
}

function cashOutFundRows(funds, trips) {
  if (!funds.length) return `<tr><td colspan="3" class="empty">${t('noFundsForRoute')}</td></tr>`;
  const validTrips = Number.isSafeInteger(trips) && trips > 0;
  return funds.map((fund) => `<tr>
    <td><label class="fund-check"><input type="checkbox" name="fund_ids" value="${fund.id}" data-amount="${fund.amount_paisa}" checked> ${escapeHtml(fund.name)}</label></td>
    <td>${formatMoney(fund.amount_paisa)}</td>
    <td data-fund-total="${fund.id}">${formatMoney(validTrips ? fund.amount_paisa * trips : 0)}</td>
  </tr>`).join('');
}

function updateCashOutTotals(form, trips, availablePaisa) {
  const boxes = [...form.querySelectorAll('input[name="fund_ids"]')];
  let grandTotal = 0;
  let selectedCount = 0;
  for (const box of boxes) {
    const amount = Number(box.dataset.amount || 0);
    const total = box.checked && Number.isSafeInteger(trips) && trips > 0 ? amount * trips : 0;
    const cell = form.querySelector(`[data-fund-total="${box.value}"]`);
    if (cell) cell.textContent = formatMoney(total);
    if (box.checked) {
      grandTotal += total;
      selectedCount += 1;
    }
  }
  form.elements.grand_total_bdt.value = (grandTotal / 100).toFixed(2);
  const warning = form.querySelector('[data-cash-out-warning]');
  const validTrips = Number.isSafeInteger(trips) && trips > 0;
  let message = '';
  if (!boxes.length) message = t('noFundsForRoute');
  else if (!selectedCount) message = t('selectAtLeastOneFund');
  else if (!validTrips) message = t('enterTotalTrips');
  else if (grandTotal > availablePaisa) message = t('cashOutTooBig');
  if (warning) warning.textContent = message;
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = Boolean(message) || grandTotal <= 0;
  return { grandTotal, selectedFundIds: boxes.filter((box) => box.checked).map((box) => Number(box.value)) };
}

async function renderCashbook() {
  const data = await window.somiti.cashbook.get();
  const totalFundBalance = data.funds.reduce((total, fund) => total + fund.balance_paisa, 0);
  const metrics = [
    [t('totalCashIn'), formatMoney(data.totals.cash_in_paisa), '↗'],
    [t('totalCashOut'), formatMoney(data.totals.cash_out_paisa), '⇄'],
    [t('availableCash'), formatMoney(data.totals.available_paisa), '৳'],
    [t('fundBalance'), formatMoney(totalFundBalance), '◉']
  ];
  const isAdmin = state.user.role === 'admin';
  const incomeRows = data.income.map((item) => {
    const editable = item.source === 'route' && item.route_id && data.routes.some((route) => route.id === item.route_id);
    const actions = `<div class="action-cell"><button class="button button-outline button-small" data-cash-in-view="${escapeHtml(item.id)}">${t('view')}</button>
      ${isAdmin && editable ? `<button class="button button-outline button-small" data-cash-in-edit="${item.id}">${t('edit')}</button>` : ''}
      ${isAdmin && item.source === 'route' ? `<button class="button button-danger button-small" data-cash-in-delete="${item.id}">${t('delete')}</button>` : ''}</div>`;
    return `<tr><td>${item.cash_in_type === 'Holiday' ? t('holidayCashIn') : t('regularCashIn')}</td>
      <td>${escapeHtml(item.route_name)}</td><td>${item.per_trip_paisa == null ? '—' : formatMoney(item.per_trip_paisa)}</td>
      <td>${item.total_trips ?? '—'}</td><td>${formatMoney(item.total_amount_paisa)}</td><td>${escapeHtml(item.date)}</td><td>${actions}</td></tr>`;
  }).join('');
  const fundRows = data.funds.map((fund) => [
    escapeHtml(fund.name), escapeHtml(fund.route_name || '—'),
    fund.amount_paisa > 0 ? formatMoney(fund.amount_paisa) : '—',
    formatMoney(fund.cash_out_paisa), formatMoney(fund.balance_paisa)
  ]);
  const cashOutRoutes = data.routes;
  const cashOutRouteOptions = cashOutRoutes.map((route) => `<option value="${route.id}">${escapeHtml(route.name)}</option>`).join('');
  const requestKey = window.crypto.randomUUID();
  $('#content').innerHTML = `<div class="cards">${metrics.map(([title, amount, icon]) => card(title, amount, icon)).join('')}</div>
    <div class="panel"><div class="panel-heading"><h2>${t('cashInHistory')}</h2><div class="action-cell">${isAdmin && data.income.length ? `<button id="cashbook-clear-income" class="button button-danger button-small">${t('clearAll')}</button>` : ''}<button id="cashbook-add-income" class="button button-primary" ${data.routes.length ? '' : 'disabled'}>＋ ${t('addCashIn')}</button></div></div>
      <p class="subheading">${t('cashInFormHint')}</p>
      ${incomeRows.length ? `<div class="table-wrap"><table><thead><tr>${[t('cashInType'), t('route'), t('perTripAmount'), t('totalTrips'), t('totalAmount'), t('date'), t('actions')].map((heading) => `<th>${heading}</th>`).join('')}</tr></thead><tbody>${incomeRows}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}
    </div>
    <div class="panel"><div class="panel-heading"><h2>${t('cashOut')}</h2><div class="action-cell">${isAdmin && data.cashOuts.length ? `<button id="cashbook-clear-out" class="button button-danger button-small">${t('clearAll')}</button>` : ''}<button id="cashbook-add-out" class="button button-primary" ${cashOutRoutes.length ? '' : 'disabled'}>＋ ${t('addCashOut')}</button></div></div>
      <p class="subheading">${cashOutRoutes.length ? t('cashOutFormHint') : t('noFundsForRoute')}</p>
      ${cashOutRoutes.length ? `<form id="cash-out-form" class="form-grid">
        <div class="field"><label>${t('date')}</label><input name="date" type="date" value="${today()}" required></div>
        <div class="field"><label>${t('route')}</label><select name="route_id" required>${cashOutRouteOptions}</select></div>
        <div class="field"><label>${t('totalTrips')}</label><input name="total_trips" type="number" min="1" step="1" required></div>
        <div class="field full"><label>${t('assignedFunds')}</label>
          <div class="table-wrap"><table><thead><tr><th>${t('fund')}</th><th>${t('perTripFundAmount')}</th><th>${t('totalAmount')}</th></tr></thead>
            <tbody id="cash-out-fund-rows"></tbody></table></div>
        </div>
        <div class="field"><label>${t('grandTotal')}</label><input name="grand_total_bdt" readonly></div>
        <div class="field"><button type="submit" class="button button-primary" disabled>${t('save')}</button></div>
        <p class="error-text field full" data-cash-out-warning></p>
      </form>` : ''}
    </div>
    <div class="dashboard-grid">
      <div class="panel"><div class="panel-heading"><h2>${t('fundWiseBalance')}</h2></div>
        ${table([t('fund_id'), t('route'), t('perTripFundAmount'), t('totalCashOut'), t('balance_paisa')], fundRows)}</div>
      <div class="panel"><div class="panel-heading"><h2>${t('cashOutHistory')}</h2></div>
        ${table([t('date'), t('route'), t('fund_id'), t('perTripFundAmount'), t('totalTrips'), t('amount_bdt'), t('actions')], data.cashOuts.map((item) => [
          escapeHtml(item.date), escapeHtml(item.route_name || '—'), escapeHtml(item.fund_name),
          item.per_trip_paisa == null ? '—' : formatMoney(item.per_trip_paisa), item.total_trips ?? '—',
          formatMoney(item.amount_paisa),
          `<div class="action-cell"><button class="button button-outline button-small" data-cash-out-view="${item.id}">${t('view')}</button>
            ${isAdmin && item.source !== 'legacy' && item.route_id && item.fund_id && data.funds.some((fund) => fund.id === item.fund_id && fund.route_id === item.route_id && fund.amount_paisa > 0) ? `<button class="button button-outline button-small" data-cash-out-edit="${item.id}">${t('edit')}</button><button class="button button-danger button-small" data-cash-out-delete="${item.id}">${t('delete')}</button>` : ''}</div>`
        ]))}</div>
    </div>
    <div class="panel"><div class="panel-heading"><h2>${t('fundWiseHistory')}</h2></div>
      ${table([t('date'), t('route'), t('fund_id'), t('perTripFundAmount'), t('totalTrips'), t('amount_bdt')], data.cashOuts.map((item) => [
        escapeHtml(item.date), escapeHtml(item.route_name || '—'), escapeHtml(item.fund_name),
        item.per_trip_paisa == null ? '—' : formatMoney(item.per_trip_paisa), item.total_trips ?? '—', formatMoney(item.amount_paisa)
      ]))}</div>
    `;
  $('#cashbook-add-income').addEventListener('click', () => openCashInForm(data));
  $('#cashbook-clear-income')?.addEventListener('click', async () => {
    if (!confirm(t('confirmClearCashIn'))) return;
    try {
      await window.somiti.cashbook.clearIn();
      toast(t('saved'));
      await renderCashbook();
    } catch (error) { toast(explain(error.message)); }
  });
  $('#cashbook-add-out')?.addEventListener('click', () => openCashOutForm(data));
  $('#cashbook-clear-out')?.addEventListener('click', async () => {
    if (!confirm(t('confirmClearCashOut'))) return;
    try {
      await window.somiti.cashbook.clearOut();
      toast(t('saved'));
      await renderCashbook();
    } catch (error) { toast(explain(error.message)); }
  });
  $$('[data-cash-in-view]').forEach((button) => button.addEventListener('click', () => {
    const item = data.income.find((entry) => String(entry.id) === button.dataset.cashInView);
    if (item) openCashInView(item);
  }));
  $$('[data-cash-in-edit]').forEach((button) => button.addEventListener('click', () => {
    const item = data.income.find((entry) => entry.id === Number(button.dataset.cashInEdit));
    if (item) openCashInForm(data, item);
  }));
  $$('[data-cash-in-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm(t('confirmDelete'))) return;
    try {
      await window.somiti.cashbook.delete(Number(button.dataset.cashInDelete));
      toast(t('saved'));
      await renderCashbook();
    } catch (error) { toast(explain(error.message)); }
  }));
  $$('[data-cash-out-view]').forEach((button) => button.addEventListener('click', () => {
    const item = data.cashOuts.find((entry) => entry.id === Number(button.dataset.cashOutView));
    if (item) openCashOutView(item);
  }));
  $$('[data-cash-out-edit]').forEach((button) => button.addEventListener('click', () => {
    const item = data.cashOuts.find((entry) => entry.id === Number(button.dataset.cashOutEdit));
    if (item) openCashOutForm(data, item);
  }));
  $$('[data-cash-out-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm(t('confirmDelete'))) return;
    try {
      await window.somiti.cashbook.deleteOut(Number(button.dataset.cashOutDelete));
      toast(t('saved'));
      await renderCashbook();
    } catch (error) { toast(explain(error.message)); }
  }));
  const outForm = $('#cash-out-form');
  if (outForm) {
    const routeSelect = outForm.elements.route_id;
    const tripInput = outForm.elements.total_trips;
    const fundRows = outForm.querySelector('#cash-out-fund-rows');
    const updateFunds = () => {
      const trips = Number(tripInput.value);
      fundRows.innerHTML = cashOutFundRows(assignedFundsForRoute(data, routeSelect.value), trips);
      updateCashOutTotals(outForm, trips, data.totals.available_paisa);
    };
    const updateTotal = () => updateCashOutTotals(outForm, Number(tripInput.value), data.totals.available_paisa);
    routeSelect.addEventListener('change', updateFunds);
    fundRows.addEventListener('change', updateTotal);
    tripInput.addEventListener('input', updateTotal);
    updateFunds();
    outForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = outForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const selectedFundIds = [...outForm.querySelectorAll('input[name="fund_ids"]:checked')].map((box) => Number(box.value));
        const result = await window.somiti.cashbook.createOutBatch({
          date: outForm.elements.date.value,
          route_id: Number(routeSelect.value), fund_ids: selectedFundIds,
          total_trips: Number(tripInput.value), request_key: requestKey
        });
        toast(result.duplicate ? t('cashOutDuplicate') : t('cashOutSaved'));
        await renderCashbook();
      } catch (error) {
        submit.disabled = false;
        toast(explain(error.message));
      }
    });
  }
}

function openCashOutView(item) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="modal"><h2>${t('cashOut')}</h2><div class="form-grid">
    <div class="field"><label>${t('route')}</label><div>${escapeHtml(item.route_name || '—')}</div></div>
    <div class="field"><label>${t('fund_id')}</label><div>${escapeHtml(item.fund_name)}</div></div>
    <div class="field"><label>${t('perTripFundAmount')}</label><div>${item.per_trip_paisa == null ? '—' : formatMoney(item.per_trip_paisa)}</div></div>
    <div class="field"><label>${t('totalTrips')}</label><div>${item.total_trips ?? '—'}</div></div>
    <div class="field"><label>${t('totalAmount')}</label><div>${formatMoney(item.amount_paisa)}</div></div>
    <div class="field"><label>${t('date')}</label><div>${escapeHtml(item.date)}</div></div>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('close')}</button></div></div>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
}

function openCashOutForm(data, existing = null) {
  if (existing && !existing.batch_key) return openSingleCashOutForm(data, existing);
  const routeId = existing?.route_id ?? data.routes[0]?.id;
  const requestKey = existing ? null : window.crypto.randomUUID();
  const routeOptions = data.routes.map((route) => `<option value="${route.id}" ${route.id === routeId ? 'selected' : ''}>${escapeHtml(route.name)}</option>`).join('');
  const currentBatchTotal = existing?.batch_key
    ? data.cashOuts.filter((row) => row.batch_key === existing.batch_key).reduce((total, row) => total + row.amount_paisa, 0) : 0;
  const availablePaisa = data.totals.available_paisa + currentBatchTotal;
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${existing ? t('edit') : t('addCashOut')}</h2><div class="form-grid">
    <div class="field"><label>${t('date')}</label><input name="date" type="date" value="${escapeHtml(existing?.date || today())}" required></div>
    <div class="field"><label>${t('route')}</label><select name="route_id" required>${routeOptions}</select></div>
    <div class="field"><label>${t('totalTrips')}</label><input name="total_trips" type="number" min="1" step="1" value="${existing?.total_trips ?? ''}" required></div>
    <div class="field full"><label>${t('assignedFunds')}</label>
      <div class="table-wrap"><table><thead><tr><th>${t('fund')}</th><th>${t('perTripFundAmount')}</th><th>${t('totalAmount')}</th></tr></thead>
        <tbody id="cash-out-modal-fund-rows"></tbody></table></div>
    </div>
    <div class="field"><label>${t('grandTotal')}</label><input name="grand_total_bdt" readonly></div>
    <p class="error-text field full" data-cash-out-warning></p>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button type="submit" class="button button-primary" disabled>${t('save')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  const form = modal.querySelector('form');
  const routeSelect = form.elements.route_id;
  const tripInput = form.elements.total_trips;
  const fundRows = form.querySelector('#cash-out-modal-fund-rows');
  const updateFunds = () => {
    const trips = Number(tripInput.value);
    fundRows.innerHTML = cashOutFundRows(assignedFundsForRoute(data, routeSelect.value), trips);
    updateCashOutTotals(form, trips, availablePaisa);
  };
  const updateTotal = () => updateCashOutTotals(form, Number(tripInput.value), availablePaisa);
  routeSelect.addEventListener('change', updateFunds);
  fundRows.addEventListener('change', updateTotal);
  tripInput.addEventListener('input', updateTotal);
  updateFunds();
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    const selectedFundIds = [...form.querySelectorAll('input[name="fund_ids"]:checked')].map((box) => Number(box.value));
    const cashOut = {
      date: form.elements.date.value,
      route_id: Number(routeSelect.value),
      fund_ids: selectedFundIds,
      total_trips: Number(tripInput.value),
      request_key: requestKey
    };
    if (existing) cashOut.id = existing.id;
    try {
      const result = existing
        ? await window.somiti.cashbook.updateOutBatch(cashOut)
        : await window.somiti.cashbook.createOutBatch(cashOut);
      modal.remove();
      toast(result.duplicate ? t('cashOutDuplicate') : t('cashOutSaved'));
      await renderCashbook();
    } catch (error) {
      submit.disabled = false;
      toast(explain(error.message));
    }
  });
}

function openSingleCashOutForm(data, existing) {
  const routeOptions = data.routes.map((route) => `<option value="${route.id}" ${route.id === existing.route_id ? 'selected' : ''}>${escapeHtml(route.name)}</option>`).join('');
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${t('edit')}</h2><div class="form-grid">
    <div class="field"><label>${t('date')}</label><input name="date" type="date" value="${escapeHtml(existing.date)}" required></div>
    <div class="field"><label>${t('route')}</label><select name="route_id" required>${routeOptions}</select></div>
    <div class="field"><label>${t('fund_id')}</label><select name="fund_id" required></select></div>
    <div class="field"><label>${t('perTripFundAmount')}</label><input name="per_trip_fund_bdt" readonly></div>
    <div class="field"><label>${t('totalTrips')}</label><input name="total_trips" type="number" min="1" step="1" value="${existing.total_trips ?? ''}" required></div>
    <div class="field"><label>${t('totalAmount')}</label><input name="total_out_bdt" readonly></div>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button type="submit" class="button button-primary">${t('save')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  const form = modal.querySelector('form');
  const routeSelect = form.elements.route_id;
  const fundSelect = form.elements.fund_id;
  const tripInput = form.elements.total_trips;
  const updateTotal = () => {
    const amount = Number(fundSelect.selectedOptions[0]?.dataset.amount || 0);
    form.elements.per_trip_fund_bdt.value = (amount / 100).toFixed(2);
    const trips = Number(tripInput.value);
    form.elements.total_out_bdt.value = Number.isSafeInteger(trips) && trips > 0 && Number.isSafeInteger(amount * trips)
      ? (amount * trips / 100).toFixed(2) : '0.00';
  };
  const updateFunds = (selectedFundId = null) => {
    const funds = assignedFundsForRoute(data, routeSelect.value);
    fundSelect.innerHTML = funds.map((fund) => `<option value="${fund.id}" data-amount="${fund.amount_paisa}" ${fund.id === selectedFundId ? 'selected' : ''}>${escapeHtml(fund.name)}</option>`).join('');
    updateTotal();
  };
  routeSelect.addEventListener('change', () => updateFunds());
  fundSelect.addEventListener('change', updateTotal);
  tripInput.addEventListener('input', updateTotal);
  updateFunds(existing.fund_id);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    const cashOut = {
      id: existing.id,
      date: form.elements.date.value,
      route_id: Number(routeSelect.value),
      fund_id: Number(fundSelect.value),
      total_trips: Number(tripInput.value)
    };
    try {
      const result = await window.somiti.cashbook.updateOut(cashOut);
      modal.remove();
      toast(result.duplicate ? t('cashOutDuplicate') : t('cashOutSaved'));
      await renderCashbook();
    } catch (error) {
      submit.disabled = false;
      toast(explain(error.message));
    }
  });
}

function openCashInView(item) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="modal"><h2>${t('cashIn')}</h2><div class="form-grid">
    <div class="field"><label>${t('cashInType')}</label><div>${item.cash_in_type === 'Holiday' ? t('holidayCashIn') : t('regularCashIn')}</div></div>
    <div class="field"><label>${t('route')}</label><div>${escapeHtml(item.route_name)}</div></div>
    <div class="field"><label>${t('perTripAmount')}</label><div>${item.per_trip_paisa == null ? '—' : formatMoney(item.per_trip_paisa)}</div></div>
    <div class="field"><label>${t('totalTrips')}</label><div>${item.total_trips ?? '—'}</div></div>
    <div class="field"><label>${t('totalAmount')}</label><div>${formatMoney(item.total_amount_paisa)}</div></div>
    <div class="field"><label>${t('date')}</label><div>${escapeHtml(item.date)}</div></div>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('close')}</button></div></div>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
}

function openCashInForm(data, existing = null) {
  const routeOptions = data.routes.map((route) => `<option value="${route.id}" data-charge="${route.charge_paisa}" ${existing?.route_id === route.id ? 'selected' : ''}>${escapeHtml(route.name)}</option>`).join('');
  const selectedRoute = data.routes.find((route) => route.id === (existing?.route_id ?? data.routes[0]?.id));
  const initialCharge = selectedRoute?.charge_paisa || 0;
  const initialTrips = existing?.total_trips || '';
  const initialDate = existing?.date || today();
  const initialType = existing?.cash_in_type || 'Regular';
  const requestKey = existing ? null : window.crypto.randomUUID();
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${existing ? t('edit') : t('addCashIn')}</h2><div class="form-grid">
    <div class="field"><label>${t('cashInType')}</label><select name="cash_in_type" required>
      <option value="Regular" ${initialType === 'Regular' ? 'selected' : ''}>${t('regularCashIn')}</option>
      <option value="Holiday" ${initialType === 'Holiday' ? 'selected' : ''}>${t('holidayCashIn')}</option>
    </select></div>
    <div class="field"><label>${t('date')}</label><input name="date" type="date" value="${escapeHtml(initialDate)}" required></div>
    <div class="field"><label>${t('route')}</label><select name="route_id" required>${routeOptions}</select></div>
    <div class="field"><label>${t('perTripAmount')}</label><input name="per_trip_bdt" value="${(initialCharge / 100).toFixed(2)}" readonly></div>
    <div class="field"><label>${t('totalTrips')}</label><input name="total_trips" type="number" min="1" step="1" value="${initialTrips}" required></div>
    <div class="field"><label>${t('totalAmount')}</label><input name="total_bdt" value="${(initialCharge * Number(initialTrips || 0) / 100).toFixed(2)}" readonly></div>
    <div class="field full"><label>${t('routeBuses')}</label>
      <p class="muted bus-list-hint">${t('routeBusHint')}</p>
      <div id="cash-in-bus-list" class="bus-list-box"><div class="empty">${t('loading')}</div></div>
    </div>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button type="submit" class="button button-primary">${t('save')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  const form = modal.querySelector('form');
  const routeSelect = form.elements.route_id;
  const tripInput = form.elements.total_trips;
  const updateTotal = () => {
    const charge = Number(routeSelect.selectedOptions[0]?.dataset.charge || 0);
    form.elements.per_trip_bdt.value = (charge / 100).toFixed(2);
    const trips = Number(tripInput.value);
    form.elements.total_bdt.value = Number.isSafeInteger(trips) && trips > 0 && Number.isSafeInteger(charge * trips)
      ? (charge * trips / 100).toFixed(2) : '0.00';
  };
  const busList = form.querySelector('#cash-in-bus-list');
  let busRequest = 0;
  const loadRouteBuses = async () => {
    const current = ++busRequest;
    const routeId = Number(routeSelect.value);
    busList.innerHTML = `<div class="empty">${t('loading')}</div>`;
    try {
      const buses = await window.somiti.records.list('buses', '', { route_id: routeId });
      if (current !== busRequest) return;
      if (!buses.length) {
        busList.innerHTML = `<div class="empty">${t('noRouteBuses')}</div>`;
        return;
      }
      busList.innerHTML = `<div class="table-wrap"><table><thead><tr>
        <th>${t('registration_number')}</th><th>${t('owner_name')}</th><th>${t('owner_mobile')}</th><th>${t('status')}</th>
        </tr></thead><tbody>${buses.map((bus) => `<tr class="${bus.status === 'Active' ? '' : 'bus-row-inactive'}">
          <td>${escapeHtml(bus.registration_number)}</td>
          <td>${escapeHtml(bus.owner_name || '—')}</td>
          <td>${escapeHtml(bus.owner_mobile || '—')}</td>
          <td>${status(bus.status)}</td>
        </tr>`).join('')}</tbody></table></div>`;
    } catch (error) {
      if (current !== busRequest) return;
      busList.innerHTML = `<div class="empty">${escapeHtml(explain(error.message))}</div>`;
    }
  };
  routeSelect.addEventListener('change', () => { updateTotal(); loadRouteBuses(); });
  tripInput.addEventListener('input', updateTotal);
  loadRouteBuses();
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    const cashIn = {
      cash_in_type: form.elements.cash_in_type.value,
      date: form.elements.date.value,
      route_id: Number(routeSelect.value),
      total_trips: Number(tripInput.value),
      request_key: requestKey
    };
    if (existing) cashIn.id = existing.id;
    try {
      const result = existing ? await window.somiti.cashbook.update(cashIn) : await window.somiti.cashbook.create(cashIn);
      modal.remove();
      toast(result.duplicate ? t('cashInDuplicate') : t('cashInSaved'));
      await renderCashbook();
    } catch (error) {
      submit.disabled = false;
      toast(explain(error.message));
    }
  });
}

async function renderReports() {
  const types = [
    ['cash-in-regular', t('regularCashInReport')], ['cash-in-holiday', t('holidayCashInReport')],
    ['cash-in', t('combinedCashInReport')], ['cash-out', t('cashOutReport')],
    ['daily-cashbook', t('dailyCashbookReport')],
    ['bus-status', t('busStatusReport')], ['bus-status-list', t('busStatusListReport')],
    ['buses', t('busWiseReport')], ['owners', t('ownerWiseReport')],
    ['routes', t('routeWiseReport')], ['members', t('memberWiseReport')], ['receipts', t('receiptsReport')],
    ['funds', t('fundWiseReport')]
  ];
  const routeOptions = [...state.routes].sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((route) => `<option value="${route.id}">${escapeHtml(route.name)}</option>`).join('');
  $('#content').innerHTML = `<div class="panel"><div class="report-filters"><div class="field"><label>${t('reportType')}</label><select id="report-type">
    ${types.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
    </select></div>
    <div class="field date-only"><label>${t('from')}</label><input id="report-from" type="date" value="${new Date().getFullYear()}-01-01"></div>
    <div class="field date-only"><label>${t('to')}</label><input id="report-to" type="date" value="${today()}"></div>
    <div class="field bus-status-only" hidden><label>${t('route_id')}</label><select id="report-route"><option value="">${t('allRoutes')}</option>${routeOptions}</select></div>
    <div class="field bus-status-only" hidden><label>${t('status')}</label><select id="report-status">
      <option value="">${t('allStatuses')}</option><option value="Active">${t('activeOnly')}</option><option value="Inactive">${t('inactiveOnly')}</option>
    </select></div>
    <div class="field bus-status-only" hidden><label>${t('registration_number')}</label><input id="report-bus-search" placeholder="${t('searchByBusNumber')}"></div>
    <button id="run-report" class="button button-primary">${t('showReport')}</button><span class="spacer"></span><button id="print-report" class="button button-outline">${t('printA4')}</button><button id="pdf-report" class="button button-outline">${t('exportPdf')}</button><button id="excel-report" class="button button-outline">${t('exportExcel')}</button></div><div id="report-results" class="empty">${t('loading')}</div></div>`;
  let reportRows = [];
  let reportSummary = [];
  let headers = [];
  let reportTitle = '';
  let reportRange = '';
  let reportKind = '';
  const reportValue = (key, value) => {
    if (key === 'cash_in_type') {
      if (value === 'Regular') return t('regularCashIn');
      if (value === 'Holiday') return t('holidayCashIn');
    }
    if (key === 'transaction_type') {
      if (value === 'Cash In') return t('cashIn');
      if (value === 'Cash Out') return t('cashOut');
    }
    return value ?? '';
  };
  const busStatusTypes = ['bus-status', 'bus-status-list'];
  const summaryHeaders = ['route_name', 'total_buses', 'active_buses', 'inactive_buses'];
  const summaryCells = (row) => summaryHeaders.map((key) => escapeHtml(row[key] ?? 0));
  const summaryTable = (summary) => summary.length
    ? renderCustomTable(summaryHeaders.map((key) => t(key)), summary.map(summaryCells))
    : `<div class="empty">${t('noRows')}</div>`;
  const cashInReportMarkup = (rows) => {
    const groups = new Map();
    for (const row of rows) {
      const key = String(row.cash_in_id);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return `<div class="cash-in-report-list">${[...groups.values()].map((group) => {
      const transaction = group[0];
      const buses = group.filter((row) => row.registration_number);
      const busRows = buses.map((bus) => `<tr>
        <td>${escapeHtml(bus.registration_number)}</td>
        <td>${escapeHtml(bus.owner_name || '')}</td>
        <td>${escapeHtml(bus.owner_mobile || '')}</td>
        <td>${escapeHtml(bus.address || '')}</td>
        <td>${status(bus.status)}</td>
      </tr>`).join('');
      return `<section class="cash-in-report-record">
        <div class="cash-in-transaction">
          <div><span>${t('date')}</span><strong>${escapeHtml(transaction.date)}</strong></div>
          <div><span>${t('cashInType')}</span><strong>${transaction.cash_in_type === 'Holiday' ? t('holidayCashIn') : t('regularCashIn')}</strong></div>
          <div><span>${t('route_name')}</span><strong>${escapeHtml(transaction.route_name)}</strong></div>
          <div><span>${t('per_trip_paisa')}</span><strong>${transaction.per_trip_paisa == null ? '—' : formatMoney(transaction.per_trip_paisa)}</strong></div>
          <div><span>${t('total_trips')}</span><strong>${transaction.total_trips ?? '—'}</strong></div>
          <div><span>${t('total_amount_paisa')}</span><strong>${formatMoney(transaction.total_amount_paisa)}</strong></div>
        </div>
        <div class="cash-in-bus-summary">
          <strong>${t('total_buses')}: ${transaction.total_buses}</strong>
          <span>${t('active_buses')}: ${transaction.active_buses}</span>
          <span>${t('inactive_buses')}: ${transaction.inactive_buses}</span>
        </div>
        ${buses.length ? `<div class="table-wrap"><table><thead><tr>
          <th>${t('registration_number')}</th><th>${t('owner_name')}</th><th>${t('owner_mobile')}</th>
          <th>${t('address')}</th><th>${t('status')}</th>
        </tr></thead><tbody>${busRows}</tbody></table></div>` : `<div class="empty">${t('noRouteBuses')}</div>`}
      </section>`;
    }).join('')}</div>`;
  };
  const toggleReportFilters = () => {
    const busStatus = busStatusTypes.includes($('#report-type').value);
    $$('.date-only').forEach((field) => { field.hidden = busStatus; });
    $$('.bus-status-only').forEach((field) => { field.hidden = !busStatus; });
  };
  const run = async () => {
    try {
      const type = $('#report-type').value;
      const from = $('#report-from').value;
      const to = $('#report-to').value;
      const filters = { type, from, to };
      const isBusStatus = busStatusTypes.includes(type);
      if (isBusStatus) {
        filters.route_id = $('#report-route').value || null;
        filters.status = $('#report-status').value;
        filters.bus_search = $('#report-bus-search').value.trim();
      }
      $('#report-results').innerHTML = `<div class="empty">${t('loading')}</div>`;
      reportSummary = [];
      if (type === 'bus-status-list') {
        [reportRows, reportSummary] = await Promise.all([
          window.somiti.reports.get(filters),
          window.somiti.reports.get({ ...filters, type: 'bus-status' })
        ]);
      } else {
        reportRows = await window.somiti.reports.get(filters);
      }
      reportKind = type;
      headers = reportRows.length ? Object.keys(reportRows[0]).filter((key) => key !== 'cash_in_id') : [];
      reportTitle = $('#report-type').selectedOptions[0].textContent;
      const routeLabel = $('#report-route').selectedOptions[0]?.textContent || t('allRoutes');
      const statusText = $('#report-status').selectedOptions[0]?.textContent || t('allStatuses');
      reportRange = isBusStatus
        ? [routeLabel, statusText, filters.bus_search ? `${t('registration_number')}: ${filters.bus_search}` : ''].filter(Boolean).join(' · ')
        : `${from} – ${to}`;
      const display = reportRows.map((row) => headers.map((key) => {
        if (key.endsWith('_paisa')) return formatMoney(row[key]);
        if (key === 'status') return escapeHtml(statusLabel(row[key]));
        return escapeHtml(reportValue(key, row[key]));
      }));
      if (!display.length) {
        $('#report-results').innerHTML = `<div class="empty">${t('noRows')}</div>`;
        return;
      }
      const detailTable = renderCustomTable(headers.map((key) => t(key)), display);
      if (type.startsWith('cash-in')) {
        $('#report-results').innerHTML = cashInReportMarkup(reportRows);
      } else {
        $('#report-results').innerHTML = type === 'bus-status-list'
          ? `${detailTable}<h3 class="report-section-title">${t('routeSummary')}</h3>${summaryTable(reportSummary)}`
          : detailTable;
      }
    } catch (error) {
      reportRows = [];
      reportSummary = [];
      headers = [];
      $('#report-results').innerHTML = `<div class="empty">${escapeHtml(explain(error.message))}</div>`;
      toast(explain(error.message));
    }
  };
  const printReport = async () => {
    if (!reportRows.length) { toast(t('noRows')); return; }
    try {
      const settings = await window.somiti.settings.get();
      const cells = (row) => headers.map((key) => `<td>${key.endsWith('_paisa') ? formatMoney(row[key]) : key === 'status' ? escapeHtml(statusLabel(row[key])) : escapeHtml(reportValue(key, row[key]))}</td>`).join('');
      const isCashInReport = reportKind.startsWith('cash-in');
      const reportCount = isCashInReport
        ? new Set(reportRows.map((row) => row.cash_in_id)).size
        : reportRows.length;
      const reportMarkup = isCashInReport
        ? cashInReportMarkup(reportRows)
        : `<table><thead><tr>${headers.map((key) => `<th>${t(key)}</th>`).join('')}</tr></thead><tbody>${reportRows.map((row) => `<tr>${cells(row)}</tr>`).join('')}</tbody></table>`;
      const summaryMarkup = reportKind === 'bus-status-list' && reportSummary.length
        ? `<h3 class="report-section-title">${t('routeSummary')}</h3><table><thead><tr>${summaryHeaders.map((key) => `<th>${t(key)}</th>`).join('')}</tr></thead><tbody>${reportSummary.map((row) => `<tr>${summaryCells(row).map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`
        : '';
      $('#print-root').innerHTML = `<div class="print-page">
        <div class="print-head"><h1>${escapeHtml(settings.name || 'Bus Malik Somiti')}</h1>
        ${settings.address ? `<p>${escapeHtml(settings.address)}</p>` : ''}
        <h2>${escapeHtml(reportTitle)}</h2><p>${escapeHtml(reportRange)} · ${reportCount}</p>
        <p>${t('reportDate')}: ${escapeHtml(new Date().toLocaleString())}</p></div>
        ${reportMarkup}
        ${summaryMarkup}
        <div class="print-foot">${escapeHtml(new Date().toLocaleString())}</div></div>`;
      window.print();
    } catch (error) { toast(explain(error.message)); }
  };
  $('#run-report').addEventListener('click', run);
  $('#report-type').addEventListener('change', () => { toggleReportFilters(); run(); });
  $('#report-route').addEventListener('change', run);
  $('#report-status').addEventListener('change', run);
  let busSearchTimer;
  $('#report-bus-search').addEventListener('input', () => {
    clearTimeout(busSearchTimer);
    if (!busStatusTypes.includes($('#report-type').value)) return;
    busSearchTimer = setTimeout(run, 180);
  });
  $('#print-report').addEventListener('click', printReport);
  $('#pdf-report').addEventListener('click', async () => {
    if (!reportRows.length) { toast(t('noRows')); return; }
    try {
      const type = $('#report-type').value;
      const file = await window.somiti.export.pdf({
        title: reportTitle, headers: headers.map(t),
        rows: reportRows.map((row) => headers.map((key) => key.endsWith('_paisa') ? formatMoney(row[key]) : key === 'status' ? statusLabel(row[key]) : reportValue(key, row[key]))),
        orientation: ['cash-in', 'cash-out', 'bus-status', 'bus-status-list'].includes(type) ? 'portrait' : 'landscape'
      });
      if (file) toast(file);
    } catch (error) { toast(explain(error.message)); }
  });
  $('#excel-report').addEventListener('click', async () => {
    if (!reportRows.length) { toast(t('noRows')); return; }
    try {
      const file = await window.somiti.export.excel({
        title: reportTitle, headers: headers.map(t),
        rows: reportRows.map((row) => headers.map((key) => key.endsWith('_paisa') ? formatMoney(row[key]) : key === 'status' ? statusLabel(row[key]) : reportValue(key, row[key])))
      });
      if (file) toast(file);
    } catch (error) { toast(explain(error.message)); }
  });
  toggleReportFilters();
  await run();
}

async function renderBankManagement() {
  const isAdmin = state.user.role === 'admin';
  const filters = state.bankView;
  const data = await window.somiti.banks.get(filters);
  const cards = [
    [t('totalBankBalance'), formatMoney(data.totals.total_bank_balance_paisa), '▦'],
    [t('totalDeposit'), formatMoney(data.totals.total_deposit_paisa), '↘'],
    [t('totalBanks'), data.totals.bank_count, '◫']
  ];
  const bankRows = data.banks.map((bank) => [
    escapeHtml(bank.name), escapeHtml(bank.branch_name || '—'), escapeHtml(bank.account_holder || '—'),
    escapeHtml(bank.account_number), escapeHtml(bank.account_type || '—'), escapeHtml(bank.routing_number || '—'),
    formatMoney(bank.opening_balance_paisa), formatMoney(bank.deposit_paisa), formatMoney(bank.balance_paisa),
    `<div class="action-cell"><button class="button button-outline button-small" data-bank-edit="${bank.id}">${t('edit')}</button><button class="button button-danger button-small" data-bank-delete="${bank.id}">${t('delete')}</button></div>`
  ]);
  const bankOptions = data.banks.map((bank) => `<option value="${bank.id}" ${String(bank.id) === String(filters.bank_id) ? 'selected' : ''}>${escapeHtml(bank.name)} · ${escapeHtml(bank.account_number)}</option>`).join('');
  const fundOptions = data.funds.map((fund) => `<option value="${fund.id}">${escapeHtml(fund.name)} — ${formatMoney(fund.balance_paisa)}</option>`).join('');
  const canViewFunds = data.funds.length > 0;
  const historyRows = data.deposits.map((deposit) => [
    escapeHtml(deposit.date), escapeHtml(deposit.bank_name), escapeHtml(deposit.branch_name || '—'),
    escapeHtml(deposit.account_number), escapeHtml(deposit.fund_name), formatMoney(deposit.amount_paisa),
    escapeHtml(deposit.transaction_id), escapeHtml(deposit.note || '—'),
    `<div class="action-cell"><button class="button button-outline button-small" data-deposit-view="${deposit.id}">${t('view')}</button>
      ${isAdmin ? `<button class="button button-outline button-small" data-deposit-edit="${deposit.id}">${t('edit')}</button><button class="button button-danger button-small" data-deposit-delete="${deposit.id}">${t('delete')}</button>` : ''}</div>`
  ]);
  const reportBankRows = data.report.banks.map((bank) => [
    escapeHtml(bank.name), escapeHtml(bank.account_number), formatMoney(bank.opening_balance_paisa),
    formatMoney(bank.total_deposit_paisa), formatMoney(bank.total_withdrawal_paisa), formatMoney(bank.balance_paisa)
  ]);
  const reportFundRows = data.report.fundWise.map((row) => [
    escapeHtml(row.fund_name), escapeHtml(row.bank_name), escapeHtml(row.account_number),
    row.deposit_count, formatMoney(row.total_paisa)
  ]);
  $('#content').innerHTML = `<div class="cards">${cards.map(([title, amount, icon]) => card(title, amount, icon)).join('')}</div>
    <div class="panel"><div class="panel-heading"><h2>${t('bankWiseBalance')}</h2><button id="bank-add" class="button button-primary">＋ ${t('addBank')}</button></div>
      ${data.banks.length ? table([t('bankName'), t('branchName'), t('accountHolder'), t('accountNumber'), t('accountType'), t('routingNumber'), t('openingBalance'), t('totalDeposit'), t('currentBalance'), t('actions')], bankRows, null, 'bank-table bank-list-table') : `<div class="empty">${t('noBanks')}</div>`}
    </div>
    <div class="panel"><div class="panel-heading"><h2>${t('fundToBankDeposit')}</h2></div>
      <p class="subheading">${t('bankDepositHint')}</p>
      ${data.banks.length && canViewFunds ? `<form id="bank-deposit-form" class="form-grid">
        <div class="field"><label>${t('date')}</label><input name="date" type="date" value="${today()}" required></div>
        <div class="field"><label>${t('selectFund')}</label><select name="fund_id" required>${fundOptions}</select></div>
        <div class="field"><label>${t('fundAvailableBalance')}</label><input name="available_bdt" readonly></div>
        <div class="field"><label>${t('selectBank')}</label><select name="bank_id" required>${data.banks.map((bank) => `<option value="${bank.id}">${escapeHtml(bank.name)}</option>`).join('')}</select></div>
        <div class="field full"><label>${t('bankAccountInfo')}</label><div id="bank-info" class="bank-account-info"></div></div>
        <div class="field"><label>${t('depositAmount')}</label><input name="amount_bdt" type="number" min="0.01" step="0.01" required></div>
        <div class="field"><label>${t('transactionId')}</label><input name="transaction_id" maxlength="100" required></div>
        <div class="field full"><label>${t('note')}</label><input name="note" maxlength="300"></div>
        <div class="field full"><button type="submit" class="button button-primary" disabled>${t('saveDeposit')}</button></div>
        <p class="error-text field full" data-deposit-warning></p>
      </form>` : `<div class="empty">${data.banks.length ? t('noRows') : t('noBanks')}</div>`}
    </div>
    <div class="panel"><div class="panel-heading"><h2>${t('depositHistory')}</h2></div>
      <p class="subheading">${t('depositFilterHint')}</p>
      <div class="report-filters">
        <div class="field"><label>${t('startDate')}</label><input id="bank-from" type="date" value="${escapeHtml(filters.from || '')}"></div>
        <div class="field"><label>${t('endDate')}</label><input id="bank-to" type="date" value="${escapeHtml(filters.to || '')}"></div>
        <div class="field"><label>${t('selectBank')}</label><select id="bank-filter"><option value="">${t('allBanks')}</option>${bankOptions}</select></div>
        <button id="bank-filter-apply" class="button button-primary">${t('viewReport')}</button>
        <button id="bank-filter-reset" class="button button-outline">${t('resetFilters')}</button>
      </div>
      ${data.deposits.length ? table([t('date'), t('bankName'), t('branchName'), t('accountNumber'), t('fund_id'), t('depositAmount'), t('transactionId'), t('note'), t('actions')], historyRows, null, 'bank-table bank-history-table') : `<div class="empty">${t('noRows')}</div>`}
    </div>
    <div class="panel"><div class="panel-heading"><h2>${t('bankReport')}</h2><div class="action-cell"><button id="bank-print" class="button button-outline button-small">${t('printReport')}</button><button id="bank-pdf" class="button button-outline button-small">${t('downloadPdf')}</button></div></div>
      <h3 class="report-section-title">${t('bankWiseReport')}</h3>
      ${table([t('bankName'), t('accountNumber'), t('openingBalance'), t('totalDeposit'), t('totalWithdrawal'), t('currentBalance')], reportBankRows)}
      <h3 class="report-section-title">${t('fundWiseBankReport')}</h3>
      ${table([t('fund_id'), t('bankName'), t('accountNumber'), t('depositCount'), t('totalDeposit')], reportFundRows)}
    </div>`;
  $('#bank-add').addEventListener('click', () => openBankForm());
  $$('[data-bank-edit]').forEach((button) => button.addEventListener('click', () => {
    openBankForm(data.banks.find((bank) => bank.id === Number(button.dataset.bankEdit)));
  }));
  $$('[data-bank-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm(t('confirmDeleteBank'))) return;
    try {
      await window.somiti.banks.delete(Number(button.dataset.bankDelete));
      toast(t('saved'));
      await renderBankManagement();
    } catch (error) { toast(explain(error.message)); }
  }));
  const form = $('#bank-deposit-form');
  if (form) {
    const fundSelect = form.elements.fund_id;
    const bankSelect = form.elements.bank_id;
    const amountInput = form.elements.amount_bdt;
    const availableInput = form.elements.available_bdt;
    const info = $('#bank-info');
    const warning = form.querySelector('[data-deposit-warning]');
    const submit = form.querySelector('button[type="submit"]');
    const selectedFund = () => data.funds.find((fund) => Number(fund.id) === Number(fundSelect.value));
    const selectedBank = () => data.banks.find((bank) => Number(bank.id) === Number(bankSelect.value));
    const renderBankInfo = () => {
      const bank = selectedBank();
      info.innerHTML = bank ? `<span><strong>${t('bankName')}:</strong> ${escapeHtml(bank.name)}</span>
        <span><strong>${t('branchName')}:</strong> ${escapeHtml(bank.branch_name || '—')}</span>
        <span><strong>${t('accountHolder')}:</strong> ${escapeHtml(bank.account_holder || '—')}</span>
        <span><strong>${t('accountNumber')}:</strong> ${escapeHtml(bank.account_number)}</span>
        <span><strong>${t('accountType')}:</strong> ${escapeHtml(bank.account_type || '—')}</span>
        <span><strong>${t('routingNumber')}:</strong> ${escapeHtml(bank.routing_number || '—')}</span>
        <span><strong>${t('currentBalance')}:</strong> ${formatMoney(bank.balance_paisa)}</span>` : t('bankInfoHint');
    };
    const refresh = () => {
      const fund = selectedFund();
      availableInput.value = fund ? (fund.balance_paisa / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
      const amount = Math.round(Number(amountInput.value) * 100);
      const tooBig = fund && Number.isFinite(amount) && amount > fund.balance_paisa;
      warning.textContent = tooBig ? tf('depositTooBig', formatMoney(fund.balance_paisa)) : '';
      submit.disabled = !fund || !selectedBank() || !(amount > 0) || tooBig;
    };
    fundSelect.addEventListener('change', refresh);
    bankSelect.addEventListener('change', () => { renderBankInfo(); refresh(); });
    amountInput.addEventListener('input', refresh);
    renderBankInfo();
    refresh();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        await window.somiti.banks.createDeposit({
          date: form.elements.date.value,
          bank_id: Number(bankSelect.value),
          fund_id: Number(fundSelect.value),
          amount_paisa: Math.round(Number(amountInput.value) * 100),
          transaction_id: form.elements.transaction_id.value,
          note: form.elements.note.value
        });
        toast(t('depositSaved'));
        await renderBankManagement();
      } catch (error) {
        submit.disabled = false;
        toast(explain(error.message));
      }
    });
  }
  $('#bank-filter-apply').addEventListener('click', () => {
    state.bankView = { from: $('#bank-from').value, to: $('#bank-to').value, bank_id: $('#bank-filter').value };
    renderBankManagement();
  });
  $('#bank-filter-reset').addEventListener('click', () => {
    state.bankView = { from: '', to: '', bank_id: '' };
    renderBankManagement();
  });
  $$('[data-deposit-view]').forEach((button) => button.addEventListener('click', () => {
    openDepositView(data.deposits.find((deposit) => deposit.id === Number(button.dataset.depositView)));
  }));
  $$('[data-deposit-edit]').forEach((button) => button.addEventListener('click', () => {
    openDepositForm(data, data.deposits.find((deposit) => deposit.id === Number(button.dataset.depositEdit)));
  }));
  $$('[data-deposit-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm(t('confirmDeleteDeposit'))) return;
    try {
      await window.somiti.banks.deleteDeposit(Number(button.dataset.depositDelete));
      toast(t('depositDeleted'));
      await renderBankManagement();
    } catch (error) { toast(explain(error.message)); }
  }));
  const reportMarkup = async () => {
    const settings = await window.somiti.settings.get();
    const bankCells = (row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.account_number)}</td>
      <td>${formatMoney(row.opening_balance_paisa)}</td><td>${formatMoney(row.total_deposit_paisa)}</td>
      <td>${formatMoney(row.total_withdrawal_paisa)}</td><td>${formatMoney(row.balance_paisa)}</td></tr>`;
    const fundCells = (row) => `<tr><td>${escapeHtml(row.fund_name)}</td><td>${escapeHtml(row.bank_name)}</td>
      <td>${escapeHtml(row.account_number)}</td><td>${row.deposit_count}</td><td>${formatMoney(row.total_paisa)}</td></tr>`;
    return `<div class="print-page">
      <div class="print-head"><h1>${escapeHtml(settings.name || 'Bus Malik Somiti')}</h1>
      ${settings.address ? `<p>${escapeHtml(settings.address)}</p>` : ''}
      <h2>${t('bankReport')}</h2><p>${t('generatedAt')}: ${escapeHtml(new Date().toLocaleString())}</p></div>
      <h3 class="report-section-title">${t('bankWiseReport')}</h3>
      <table><thead><tr><th>${t('bankName')}</th><th>${t('accountNumber')}</th><th>${t('openingBalance')}</th>
        <th>${t('totalDeposit')}</th><th>${t('totalWithdrawal')}</th><th>${t('currentBalance')}</th></tr></thead>
        <tbody>${data.report.banks.length ? data.report.banks.map(bankCells).join('') : `<tr><td colspan="6">${t('noBanks')}</td></tr>`}</tbody></table>
      <h3 class="report-section-title">${t('fundWiseBankReport')}</h3>
      <table><thead><tr><th>${t('fund_id')}</th><th>${t('bankName')}</th><th>${t('accountNumber')}</th>
        <th>${t('depositCount')}</th><th>${t('totalDeposit')}</th></tr></thead>
        <tbody>${data.report.fundWise.length ? data.report.fundWise.map(fundCells).join('') : `<tr><td colspan="5">${t('noRows')}</td></tr>`}</tbody></table>
      <div class="print-foot">${escapeHtml(new Date().toLocaleString())}</div></div>`;
  };
  $('#bank-print').addEventListener('click', async () => {
    try {
      $('#print-root').innerHTML = await reportMarkup();
      window.print();
    } catch (error) { toast(explain(error.message)); }
  });
  $('#bank-pdf').addEventListener('click', async () => {
    try {
      const file = await window.somiti.banks.pdf();
      if (file) toast(file);
    } catch (error) { toast(explain(error.message)); }
  });
}

function openBankForm(bank = null) {
  const types = ['Current', 'Savings', 'FDR', 'Other'];
  const selectedType = bank?.account_type && types.includes(bank.account_type) ? bank.account_type : 'Current';
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${bank ? t('editBank') : t('addBank')}</h2><div class="form-grid">
    <div class="field"><label>${t('bankName')}</label><input name="name" maxlength="120" value="${escapeHtml(bank?.name || '')}" required></div>
    <div class="field"><label>${t('branchName')}</label><input name="branch_name" maxlength="120" value="${escapeHtml(bank?.branch_name || '')}"></div>
    <div class="field"><label>${t('accountHolder')}</label><input name="account_holder" maxlength="120" value="${escapeHtml(bank?.account_holder || '')}"></div>
    <div class="field"><label>${t('accountNumber')}</label><input name="account_number" maxlength="60" value="${escapeHtml(bank?.account_number || '')}" required></div>
    <div class="field"><label>${t('accountType')}</label><select name="account_type">${types.map((type) => `<option value="${type}" ${type === selectedType ? 'selected' : ''}>${type}</option>`).join('')}</select></div>
    <div class="field"><label>${t('routingNumber')}</label><input name="routing_number" maxlength="40" value="${escapeHtml(bank?.routing_number || '')}"></div>
    <div class="field"><label>${t('openingBalance')}</label><input name="opening_balance_bdt" type="number" min="0" step="0.01" value="${bank ? (bank.opening_balance_paisa / 100).toFixed(2) : '0.00'}" required></div>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button type="submit" class="button button-primary">${t('save')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  modal.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    const data = {
      name: form.elements.name.value,
      branch_name: form.elements.branch_name.value,
      account_holder: form.elements.account_holder.value,
      account_number: form.elements.account_number.value,
      account_type: form.elements.account_type.value,
      routing_number: form.elements.routing_number.value,
      opening_balance_paisa: Math.round(Number(form.elements.opening_balance_bdt.value || 0) * 100)
    };
    if (bank) data.id = bank.id;
    try {
      await window.somiti.banks.save(data);
      modal.remove();
      toast(t('bankSaved'));
      await renderBankManagement();
    } catch (error) {
      submit.disabled = false;
      toast(explain(error.message));
    }
  });
}

function openDepositView(deposit) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="modal"><h2>${t('bankDeposit')}</h2><div class="form-grid">
    <div class="field"><label>${t('date')}</label><div>${escapeHtml(deposit.date)}</div></div>
    <div class="field"><label>${t('bankName')}</label><div>${escapeHtml(deposit.bank_name)}</div></div>
    <div class="field"><label>${t('branchName')}</label><div>${escapeHtml(deposit.branch_name || '—')}</div></div>
    <div class="field"><label>${t('accountNumber')}</label><div>${escapeHtml(deposit.account_number)}</div></div>
    <div class="field"><label>${t('fund_id')}</label><div>${escapeHtml(deposit.fund_name)}</div></div>
    <div class="field"><label>${t('depositAmount')}</label><div>${formatMoney(deposit.amount_paisa)}</div></div>
    <div class="field"><label>${t('transactionId')}</label><div>${escapeHtml(deposit.transaction_id)}</div></div>
    <div class="field"><label>${t('note')}</label><div>${escapeHtml(deposit.note || '—')}</div></div>
    <div class="field"><label>${t('generatedAt')}</label><div>${escapeHtml(deposit.created_at)}</div></div>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('close')}</button></div></div>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
}

function openDepositForm(data, deposit) {
  const fundOptions = data.funds.map((fund) => `<option value="${fund.id}" ${fund.id === deposit.fund_id ? 'selected' : ''}>${escapeHtml(fund.name)} — ${formatMoney(fund.balance_paisa)}</option>`).join('');
  const bankOptions = data.banks.map((bank) => `<option value="${bank.id}" ${bank.id === deposit.bank_id ? 'selected' : ''}>${escapeHtml(bank.name)} · ${escapeHtml(bank.account_number)}</option>`).join('');
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${t('edit')} · ${t('bankDeposit')}</h2><div class="form-grid">
    <div class="field"><label>${t('date')}</label><input name="date" type="date" value="${escapeHtml(deposit.date)}" required></div>
    <div class="field"><label>${t('selectFund')}</label><select name="fund_id" required>${fundOptions}</select></div>
    <div class="field"><label>${t('fundAvailableBalance')}</label><input name="available_bdt" readonly></div>
    <div class="field"><label>${t('selectBank')}</label><select name="bank_id" required>${bankOptions}</select></div>
    <div class="field"><label>${t('depositAmount')}</label><input name="amount_bdt" type="number" min="0.01" step="0.01" value="${(deposit.amount_paisa / 100).toFixed(2)}" required></div>
    <div class="field"><label>${t('transactionId')}</label><input name="transaction_id" maxlength="100" value="${escapeHtml(deposit.transaction_id)}" required></div>
    <div class="field full"><label>${t('note')}</label><input name="note" maxlength="300" value="${escapeHtml(deposit.note || '')}"></div>
    <p class="error-text field full" data-deposit-warning></p>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button type="submit" class="button button-primary">${t('save')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  const form = modal.querySelector('form');
  const fundSelect = form.elements.fund_id;
  const amountInput = form.elements.amount_bdt;
  const availableInput = form.elements.available_bdt;
  const warning = form.querySelector('[data-deposit-warning]');
  const submit = form.querySelector('button[type="submit"]');
  const refresh = () => {
    const fund = data.funds.find((item) => item.id === Number(fundSelect.value));
    const available = fund ? fund.balance_paisa + (Number(fundSelect.value) === deposit.fund_id ? deposit.amount_paisa : 0) : 0;
    availableInput.value = (available / 100).toFixed(2);
    const amount = Math.round(Number(amountInput.value) * 100);
    const tooBig = Number.isFinite(amount) && amount > available;
    warning.textContent = tooBig ? tf('depositTooBig', formatMoney(available)) : '';
    submit.disabled = !fund || !(amount > 0) || tooBig;
  };
  fundSelect.addEventListener('change', refresh);
  amountInput.addEventListener('input', refresh);
  refresh();
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await window.somiti.banks.updateDeposit({
        id: deposit.id,
        date: form.elements.date.value,
        bank_id: Number(form.elements.bank_id.value),
        fund_id: Number(fundSelect.value),
        amount_paisa: Math.round(Number(amountInput.value) * 100),
        transaction_id: form.elements.transaction_id.value,
        note: form.elements.note.value
      });
      modal.remove();
      toast(t('depositSaved'));
      await renderBankManagement();
    } catch (error) {
      submit.disabled = false;
      toast(explain(error.message));
    }
  });
}

async function renderCashInReport() {
  const routeOptions = [...state.routes].sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((route) => `<option value="${route.id}">${escapeHtml(route.name)}</option>`).join('');
  const monthStart = `${today().slice(0, 7)}-01`;
  $('#content').innerHTML = `<div class="panel">
    <div class="report-filters cashin-filters">
      <div class="field"><label>${t('startDate')}</label><input id="cashin-from" type="date" value="${monthStart}"></div>
      <div class="field"><label>${t('endDate')}</label><input id="cashin-to" type="date" value="${today()}"></div>
      <div class="field"><label>${t('route_id')}</label><select id="cashin-route"><option value="">${t('allRoutes')}</option>${routeOptions}</select></div>
      <div class="field"><label>${t('busStatus')}</label><select id="cashin-status"><option value="">${t('allStatuses')}</option><option value="Active">${t('active')}</option><option value="Inactive">${t('inactive')}</option></select></div>
      <button id="cashin-view" class="button cashin-btn-primary">${t('viewReport')}</button>
      <span class="spacer"></span>
      <button id="cashin-print" class="button cashin-btn">${t('printReport')}</button>
      <button id="cashin-pdf" class="button cashin-btn">${t('downloadPdf')}</button>
    </div>
    <div id="cashin-result"><div class="empty">${t('loading')}</div></div>
  </div>`;
  let lastReport = null;
  const currentFilters = () => ({
    from: $('#cashin-from').value,
    to: $('#cashin-to').value,
    route_id: $('#cashin-route').value || null,
    status: $('#cashin-status').value
  });
  const generatedLabel = (value) => {
    const moment = value ? new Date(value) : new Date();
    return moment.toLocaleString(state.language === 'bn' ? 'bn-BD' : 'en-GB');
  };
  const sheet = (data) => {
    const settings = data.settings || {};
    const period = `${data.filters.from || '—'} – ${data.filters.to || '—'}`;
    const routeLabel = data.route_name || t('allRoutes');
    const busRows = data.buses.length ? data.buses.map((bus) => `<tr>
      <td class="cashin-center">${bus.serial}</td>
      <td>${escapeHtml(bus.registration_number)}</td>
      <td>${escapeHtml(bus.route_name || '—')}</td>
      <td>${escapeHtml(bus.status)}</td>
      <td class="cashin-num">${formatMoney(bus.per_trip_paisa)}</td>
      <td class="cashin-num">${formatMoney(bus.cash_in_paisa)}</td>
    </tr>`).join('') : `<tr><td colspan="6" class="cashin-empty">${t('noRows')}</td></tr>`;
    const busFoot = data.buses.length ? `<tfoot><tr class="cashin-total-row">
      <td></td><td>TOTAL</td><td></td>
      <td>${data.busTotals.count} ${data.busTotals.count === 1 ? t('bus') : t('buses')}</td>
      <td class="cashin-num">${formatMoney(data.busTotals.per_trip_paisa)}</td>
      <td class="cashin-num">${formatMoney(data.busTotals.cash_in_paisa)}</td>
    </tr></tfoot>` : '';
    const cashRows = data.cashIns.length ? data.cashIns.map((row) => `<tr>
      <td class="cashin-center">${row.serial}</td>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.cash_in_type === 'Holiday' ? t('holidayCashIn') : t('regularCashIn'))}</td>
      <td>${escapeHtml(row.route_name)}</td>
      <td class="cashin-num">${row.total_trips ?? '—'}</td>
      <td class="cashin-num">${row.per_trip_paisa == null ? '—' : formatMoney(row.per_trip_paisa)}</td>
      <td class="cashin-num">${formatMoney(row.total_amount_paisa)}</td>
      <td>${escapeHtml(row.remarks || '—')}</td>
    </tr>`).join('') : `<tr><td colspan="8" class="cashin-empty">${t('noRows')}</td></tr>`;
    return `<div class="cashin-sheet">
      <header class="cashin-head">
        ${settings.logo ? `<img class="cashin-logo" src="${fileUrl(settings.logo)}" alt="">` : ''}
        <div class="cashin-system">BUS MANAGEMENT SYSTEM</div>
        <h1>CASH IN REPORT</h1>
        <div class="cashin-company">${escapeHtml(settings.name || '')}</div>
        <div class="cashin-address">${escapeHtml(settings.address || '')}</div>
        <div class="cashin-address">Phone: ${escapeHtml(settings.phone || '—')}</div>
        <div class="cashin-meta">
          <span><strong>${t('reportPeriod')}:</strong> ${escapeHtml(period)}</span>
          <span><strong>${t('selectedRoute')}:</strong> ${escapeHtml(routeLabel)}</span>
          <span><strong>${t('generatedAt')}:</strong> ${escapeHtml(generatedLabel(data.generated_at))}</span>
        </div>
      </header>
      <h2 class="cashin-section">${t('busStatusSummary')}</h2>
      <div class="cashin-summary">
        <div><span>${t('totalBus')}</span><strong>${data.summary.total_buses}</strong></div>
        <div><span>${t('activeBus')}</span><strong>${data.summary.active_buses}</strong></div>
        <div><span>${t('inactiveBus')}</span><strong>${data.summary.inactive_buses}</strong></div>
      </div>
      <h2 class="cashin-section">${t('busList')}</h2>
      <table class="cashin-table"><thead><tr>
        <th>${t('serial')}</th><th>${t('busNumber')}</th><th>${t('route_name')}</th><th>${t('busStatus')}</th>
        <th>${t('perTripAmount')}</th><th>${t('totalCashIn')}</th>
      </tr></thead><tbody>${busRows}</tbody>${busFoot}</table>
      <h2 class="cashin-section">${t('cashInDetails')}</h2>
      <table class="cashin-table"><thead><tr>
        <th>${t('serial')}</th><th>${t('date')}</th><th>${t('cashInType')}</th><th>${t('route_name')}</th>
        <th>${t('totalTrip')}</th><th>${t('perTripAmount')}</th><th>${t('totalAmount')}</th><th>${t('remarks')}</th>
      </tr></thead><tbody>${cashRows}</tbody></table>
      <div class="cashin-totals">
        <span>${t('totalRegularCashIn')}: <strong>${formatMoney(data.totals.regular_paisa)}</strong></span>
        <span>${t('totalHolidayCashIn')}: <strong>${formatMoney(data.totals.holiday_paisa)}</strong></span>
        <span>${t('totalCashIn')}: <strong>${formatMoney(data.totals.total_paisa)}</strong></span>
      </div>
      <footer class="cashin-foot">
        <div>${t('preparedBy')}<span class="cashin-sign-line"></span></div>
        <div>${t('authorizedSignature')}<span class="cashin-sign-line"></span></div>
      </footer>
    </div>`;
  };
  const load = async () => {
    $('#cashin-result').innerHTML = `<div class="empty">${t('loading')}</div>`;
    try {
      lastReport = await window.somiti.cashInReport.get(currentFilters());
      $('#cashin-result').innerHTML = sheet(lastReport);
    } catch (error) {
      lastReport = null;
      $('#cashin-result').innerHTML = `<div class="empty error-text">${escapeHtml(explain(error.message))}</div>`;
      toast(explain(error.message));
    }
  };
  $('#cashin-view').addEventListener('click', load);
  for (const id of ['#cashin-from', '#cashin-to', '#cashin-route', '#cashin-status']) $(id).addEventListener('change', load);
  $('#cashin-print').addEventListener('click', () => {
    if (!lastReport) { toast(t('noRows')); return; }
    $('#print-root').innerHTML = sheet(lastReport);
    window.print();
  });
  $('#cashin-pdf').addEventListener('click', async () => {
    if (!lastReport) { toast(t('noRows')); return; }
    try {
      const file = await window.somiti.cashInReport.pdf(currentFilters());
      if (file) toast(file);
    } catch (error) { toast(explain(error.message)); }
  });
  await load();
}

async function renderCashOutReport() {
  const monthStart = `${today().slice(0, 7)}-01`;
  $('#content').innerHTML = `<div class="panel">
    <div class="report-filters cashin-filters">
      <div class="field"><label>${t('startDate')}</label><input id="cashout-from" type="date" value="${monthStart}"></div>
      <div class="field"><label>${t('endDate')}</label><input id="cashout-to" type="date" value="${today()}"></div>
      <button id="cashout-view" class="button cashin-btn-primary">${t('viewReport')}</button>
      <span class="spacer"></span>
      <button id="cashout-print" class="button cashin-btn">${t('printReport')}</button>
      <button id="cashout-pdf" class="button cashin-btn">${t('downloadPdf')}</button>
    </div>
    <div id="cashout-result"><div class="empty">${t('loading')}</div></div>
  </div>`;
  let lastReport = null;
  const currentFilters = () => ({
    from: $('#cashout-from').value,
    to: $('#cashout-to').value
  });
  const generatedLabel = (value) => {
    const moment = value ? new Date(value) : new Date();
    return moment.toLocaleString(state.language === 'bn' ? 'bn-BD' : 'en-GB');
  };
  const description = (row) => {
    if (!row.route_name) return row.legacy ? t('legacyDistribution') : '—';
    return row.total_trips ? `${row.route_name} · ${row.total_trips} ${t('total_trips')}` : row.route_name;
  };
  const sheet = (data) => {
    const settings = data.settings || {};
    const period = `${data.filters.from || '—'} – ${data.filters.to || '—'}`;
    const rows = data.rows.length ? data.rows.map((row) => `<tr>
      <td class="cashin-center nowrap">${row.serial}</td>
      <td class="nowrap">${escapeHtml(row.date)}</td>
      <td>${escapeHtml(description(row))}</td>
      <td>${escapeHtml(row.fund_name || '—')}</td>
      <td class="cashin-num nowrap">${formatMoney(row.amount_paisa)}</td>
    </tr>`).join('') : `<tr><td colspan="5" class="cashin-empty">${t('noRows')}</td></tr>`;
    return `<div class="cashin-sheet">
      <header class="cashin-head">
        ${settings.logo ? `<img class="cashin-logo" src="${fileUrl(settings.logo)}" alt="">` : ''}
        <div class="cashin-system">BUS MANAGEMENT SYSTEM</div>
        <h1>CASH OUT REPORT</h1>
        <div class="cashin-company">${escapeHtml(settings.name || '')}</div>
        <div class="cashin-address">${escapeHtml(settings.address || '')}</div>
        <div class="cashin-address">Phone: ${escapeHtml(settings.phone || '—')}</div>
        <div class="cashin-meta">
          <span><strong>${t('reportPeriod')}:</strong> ${escapeHtml(period)}</span>
          <span><strong>${t('generatedAt')}:</strong> ${escapeHtml(generatedLabel(data.generated_at))}</span>
        </div>
      </header>
      <h2 class="cashin-section">${t('cashOutSummary')}</h2>
      <div class="cashin-summary">
        <div><span>${t('totalVouchers')}</span><strong>${data.totals.count}</strong></div>
        <div><span>${t('totalTrips')}</span><strong>${data.totals.trips}</strong></div>
        <div><span>${t('totalCashOut')}</span><strong>${formatMoney(data.totals.amount_paisa)}</strong></div>
      </div>
      <h2 class="cashin-section">${t('cashOutDetails')}</h2>
      <table class="cashin-table"><colgroup>
        <col style="width:6%"><col style="width:16%"><col style="width:38%">
        <col style="width:28%"><col style="width:12%">
      </colgroup><thead><tr>
        <th class="nowrap">SL</th><th class="nowrap">${t('date')}</th><th>${t('expenseDescription')}</th>
        <th>${t('fund_name')}</th><th class="nowrap">${t('amount_paisa')}</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="cashin-totals">
        <span>${t('totalVouchers')}: <strong>${data.totals.count}</strong></span>
        <span>${t('totalTrips')}: <strong>${data.totals.trips}</strong></span>
        <span>${t('totalCashOut')}: <strong>${formatMoney(data.totals.amount_paisa)}</strong></span>
      </div>
      <footer class="cashin-foot">
        <div>${t('preparedBy')}<span class="cashin-sign-line"></span></div>
        <div>${t('authorizedSignature')}<span class="cashin-sign-line"></span></div>
      </footer>
    </div>`;
  };
  const load = async () => {
    $('#cashout-result').innerHTML = `<div class="empty">${t('loading')}</div>`;
    try {
      lastReport = await window.somiti.cashOutReport.get(currentFilters());
      $('#cashout-result').innerHTML = sheet(lastReport);
    } catch (error) {
      lastReport = null;
      $('#cashout-result').innerHTML = `<div class="empty error-text">${escapeHtml(explain(error.message))}</div>`;
      toast(explain(error.message));
    }
  };
  $('#cashout-view').addEventListener('click', load);
  for (const id of ['#cashout-from', '#cashout-to']) $(id).addEventListener('change', load);
  $('#cashout-print').addEventListener('click', () => {
    if (!lastReport) { toast(t('noRows')); return; }
    $('#print-root').innerHTML = sheet(lastReport);
    window.print();
  });
  $('#cashout-pdf').addEventListener('click', async () => {
    if (!lastReport) { toast(t('noRows')); return; }
    try {
      const file = await window.somiti.cashOutReport.pdf(currentFilters());
      if (file) toast(file);
    } catch (error) { toast(explain(error.message)); }
  });
  await load();
}

async function renderUsers() {
  if (state.user.role !== 'admin') { $('#content').innerHTML = `<div class="panel notice">${t('noPermission')}</div>`; return; }
  const [users, audit, loginHistory] = await Promise.all([window.somiti.users.list(), window.somiti.audit.list(), window.somiti.audit.loginHistory()]);
  const rows = users.map((user) => `<tr><td>${escapeHtml(user.full_name)}</td><td>${escapeHtml(user.username)}</td><td>${user.role === 'admin' ? t('administrator') : t('staff')}</td><td>${status(user.is_active ? 'Active' : 'Inactive')}</td><td><div class="action-cell">${user.role === 'staff' ? `<button class="button button-outline button-small" data-permissions="${user.id}">${t('permissions')}</button>` : ''}<button class="button button-outline button-small" data-toggle-user="${user.id}">${user.is_active ? t('disable') : t('enable')}</button></div></td></tr>`).join('');
  const auditRows = audit.slice(0, 40).map((item) => `<tr><td>${escapeHtml(item.created_at)}</td><td>${escapeHtml(item.full_name || item.username || '—')}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.entity)}</td><td>${escapeHtml(item.entity_id)}</td></tr>`).join('');
  const loginRows = loginHistory.slice(0, 40).map((item) => `<tr><td>${escapeHtml(item.created_at)}</td><td>${escapeHtml(item.username)}</td><td>${item.success ? status('Success') : status('Failed')}</td></tr>`).join('');
  $('#content').innerHTML = `<div class="toolbar"><span class="spacer"></span><button id="add-user" class="button button-primary">＋ ${t('add')}</button></div><div class="notice">${t('userHint')}</div><div class="panel"><div class="table-wrap"><table><thead><tr><th>${t('full_name')}</th><th>${t('username')}</th><th>${t('role')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="panel"><div class="panel-heading"><h2>${t('activityLog')}</h2></div>${auditRows ? `<div class="table-wrap"><table><thead><tr><th>${t('date')}</th><th>${t('users')}</th><th>${t('action')}</th><th>${t('record')}</th><th>${t('record_id')}</th></tr></thead><tbody>${auditRows}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}</div>
    <div class="panel"><div class="panel-heading"><h2>${t('loginHistory')}</h2></div>${loginRows ? `<div class="table-wrap"><table><thead><tr><th>${t('date')}</th><th>${t('username')}</th><th>${t('result')}</th></tr></thead><tbody>${loginRows}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}</div>`;
  $('#add-user').addEventListener('click', openUserForm);
  $$('[data-permissions]').forEach((button) => button.addEventListener('click', () => {
    const user = users.find((item) => item.id === Number(button.dataset.permissions));
    let permissions = {};
    try { permissions = JSON.parse(user.permissions_json || '{}'); } catch { permissions = {}; }
    openUserForm(user, permissions);
  }));
  $$('[data-toggle-user]').forEach((button) => button.addEventListener('click', async () => {
    const current = users.find((user) => user.id === Number(button.dataset.toggleUser));
    if (current.id === state.user.id) { toast(t('cannotDisableSelf')); return; }
    let permissions = {};
    try { permissions = JSON.parse(current.permissions_json || '{}'); } catch { permissions = {}; }
    try { await window.somiti.users.save({ ...current, permissions, is_active: !current.is_active }); renderUsers(); }
    catch (error) { toast(explain(error.message)); }
  }));
}
function openUserForm(existing = null, permissions = {}) {
  const permissionItems = ['owners', 'buses', 'routes', 'members', 'funds', 'cashbook', 'banks'];
  const deletableItems = ['owners', 'buses', 'routes', 'members', 'funds', 'banks'];
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${existing ? t('permissions') : `${t('add')} · ${t('users')}`}</h2><div class="form-grid">
    <div class="field"><label>${t('full_name')}</label><input name="full_name" value="${escapeHtml(existing?.full_name || '')}" required></div>
    ${existing ? '' : `<div class="field"><label>${t('username')}</label><input name="username" required></div>
    <div class="field"><label>${t('password')}</label><input name="password" type="password" minlength="8" required></div>
    <div class="field"><label>${t('role')}</label><select name="role"><option value="staff">${t('staff')}</option><option value="admin">${t('administrator')}</option></select></div>`}
    <div class="field full"><label>${t('staffAccess')}</label>${permissionItems.map((item) => `<label><input type="checkbox" name="permission_manage_${item}" ${permissions[`manage_${item}`] || (item === 'cashbook' && permissions.manage_finance) ? 'checked' : ''}> ${t('manage')} · ${t(item)}</label>${deletableItems.includes(item) ? `<label><input type="checkbox" name="permission_delete_${item}" ${permissions[`delete_${item}`] ? 'checked' : ''}> ${t('delete')} · ${t(item)}</label>` : ''}`).join('')}</div>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button class="button button-primary">${t('save')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  modal.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const data = Object.fromEntries(formData.entries());
    data.permissions = {};
    for (const item of permissionItems) {
      data.permissions[`manage_${item}`] = formData.has(`permission_manage_${item}`);
      if (deletableItems.includes(item)) data.permissions[`delete_${item}`] = formData.has(`permission_delete_${item}`);
    }
    if (existing) { data.id = existing.id; data.role = existing.role; data.is_active = Boolean(existing.is_active); }
    try { await window.somiti.users.save(data); modal.remove(); toast(t('saved')); renderUsers(); }
    catch (error) { toast(explain(error.message)); }
  });
}

async function renderSettings() {
  const admin = state.user.role === 'admin';
  const [receipts, settings] = await Promise.all([
    window.somiti.receipts.list(),
    admin ? window.somiti.settings.get() : Promise.resolve(null),
  ]);
  const receiptRows = receipts.slice(0, 50).map((receipt) => `<tr><td>${escapeHtml(receipt.receipt_number)}</td><td>${escapeHtml(receipt.date)}</td><td>${escapeHtml(receipt.party || '—')}</td><td>${escapeHtml(receipt.category)}</td><td>${formatMoney(receipt.amount_paisa)}</td><td><button class="button button-outline button-small" data-reprint="${receipt.id}">${t('reprint')}</button></td></tr>`).join('');
  $('#content').innerHTML = `${admin ? `<div class="panel"><div class="panel-heading"><h2>${t('associationSetup')}</h2></div><p class="subheading">${t('identityHint')}</p>
    <form id="identity-form" class="form-grid">
      <div class="field"><label>${t('associationName')}</label><input name="name" value="${escapeHtml(settings.name)}" required></div>
      <div class="field"><label>${t('associationAddress')}</label><input name="address" value="${escapeHtml(settings.address)}"></div>
      <div class="field"><label>${t('associationPhone')}</label><input name="phone" value="${escapeHtml(settings.phone || '')}"></div>
      <div class="field full"><label>${t('associationLogo')}</label><div class="pick-row">${settings.logo ? `<img class="logo-box" src="${fileUrl(settings.logo)}" alt="">` : ''}<input type="hidden" name="logo" value="${escapeHtml(settings.logo)}"><button type="button" class="button button-outline" id="logo-pick">${t('choose')}</button></div></div>
      <div class="field full"><button class="button button-primary">${t('save')}</button></div>
    </form></div>
    <div class="panel"><div class="panel-heading"><h2>${t('backup')}</h2></div><p class="subheading">${t('autoBackupHint')}</p>
      <form id="backup-form" class="form-grid">
        <div class="field"><label>${t('autoBackup')}</label><select name="auto_backup"><option value="1"${settings.auto_backup ? ' selected' : ''}>${t('active')}</option><option value="0"${settings.auto_backup ? '' : ' selected'}>${t('inactive')}</option></select></div>
        <div class="field"><label>${t('keepCopies')}</label><input name="keep_copies" type="number" min="1" max="365" value="${settings.keep_copies}"></div>
        <div class="field full"><label>${t('backupFolder')}</label><div class="pick-row"><input name="backup_folder" id="backup-folder" value="${escapeHtml(settings.backup_folder)}" readonly><button type="button" class="button button-outline" id="folder-pick">${t('choose')}</button><button type="button" class="button button-outline" id="folder-open">${t('openFolder')}</button></div></div>
        <div class="field full"><button class="button button-primary">${t('save')}</button></div>
      </form>
      <div class="toolbar"><button id="backup-button" class="button button-outline">${t('backup')}</button><button id="restore-button" class="button button-danger">${t('restore')}</button></div>
    </div>` : ''}
    <div class="panel"><div class="panel-heading"><h2>${t('changePassword')}</h2></div><form id="password-form" class="form-grid">
    <div class="field"><label>${t('current_password')}</label><input name="oldPassword" type="password" required></div>
    <div class="field"><label>${t('new_password')}</label><input name="newPassword" type="password" minlength="8" required></div>
    <div class="field"><button class="button button-primary">${t('changePassword')}</button></div></form></div>
    ${admin ? `<div class="panel"><div class="panel-heading"><h2>${t('fundsSummary')}</h2><button class="button button-outline" data-entity="funds">${t('edit')}</button></div><p class="muted">${t('amountWords')}</p></div>` : ''}
    <div class="panel"><div class="panel-heading"><h2>${t('softwareUpdate')}</h2></div><div id="update-settings"></div></div>
    <div class="panel"><div class="panel-heading"><h2>${t('receipt')}</h2></div>${receiptRows ? `<div class="table-wrap"><table><thead><tr><th>${t('receipt_number')}</th><th>${t('date')}</th><th>${t('party')}</th><th>${t('category')}</th><th>${t('amount_bdt')}</th><th>${t('actions')}</th></tr></thead><tbody>${receiptRows}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}</div>`;
  paintUpdateSettings();
  if (admin) {
    const bindLogoPick = () => {
      $('#logo-pick').addEventListener('click', async () => {
        try {
          const logo = await window.somiti.files.logo();
          if (!logo) return;
          $('.pick-row', $('#identity-form')).innerHTML = `<img class="logo-box" src="${fileUrl(logo)}" alt=""><input type="hidden" name="logo" value="${escapeHtml(logo)}"><button type="button" class="button button-outline" id="logo-pick">${t('choose')}</button>`;
          bindLogoPick();
          toast(t('logoSelected'));
        } catch (error) { toast(explain(error.message)); }
      });
    };
    bindLogoPick();
    $('#identity-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await window.somiti.settings.save(Object.fromEntries(new FormData(event.currentTarget).entries())); toast(t('settingsSaved')); renderSettings(); }
      catch (error) { toast(explain(error.message)); }
    });
    $('#folder-pick').addEventListener('click', async () => {
      try { const folder = await window.somiti.backup.pickFolder(); if (folder) $('#backup-folder').value = folder; }
      catch (error) { toast(explain(error.message)); }
    });
    $('#folder-open').addEventListener('click', async () => {
      const folder = $('#backup-folder').value;
      if (!folder) { toast(t('folderRequired')); return; }
      try { await window.somiti.backup.openFolder(folder); }
      catch (error) { toast(explain(error.message)); }
    });
    $('#backup-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      data.auto_backup = data.auto_backup === '1';
      data.keep_copies = Number(data.keep_copies);
      try { await window.somiti.settings.save(data); toast(t('settingsSaved')); renderSettings(); }
      catch (error) { toast(explain(error.message)); }
    });
    $('#backup-button').addEventListener('click', async () => { try { const file = await window.somiti.backup.save(); if (file) toast(t('backupDone')); } catch (error) { toast(explain(error.message)); } });
    $('#restore-button').addEventListener('click', async () => {
      if (!confirm(t('restoreConfirm'))) return;
      try { const restored = await window.somiti.backup.restore(); if (restored) { toast(t('restoreDone')); state.user = null; showAuth(); } }
      catch (error) { toast(explain(error.message)); }
    });
    $('[data-entity="funds"]')?.addEventListener('click', () => renderPage('funds'));
  }
  $('#password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await window.somiti.auth.changePassword(Object.fromEntries(new FormData(event.currentTarget).entries())); event.currentTarget.reset(); toast(t('passwordChanged')); }
    catch (error) { toast(explain(error.message)); }
  });
  $$('[data-reprint]').forEach((button) => button.addEventListener('click', async () => {
    try { await window.somiti.receipt.open(Number(button.dataset.reprint)); }
    catch (error) { toast(explain(error.message)); }
  }));
}

const updateView = { snapshot: null };

function updateStatusText(snapshot) {
  const version = snapshot.latest_version ? ` ${snapshot.current_version} → ${snapshot.latest_version}` : '';
  switch (snapshot.status) {
    case 'checking': return t('updateChecking');
    case 'up_to_date': return t('updateUpToDate');
    case 'optional':
    case 'mandatory': return `${t('updateAvailable')}:${version}`;
    case 'downloading': return `${t('updateDownloading')}${snapshot.download?.percent != null ? ` — ${snapshot.download.percent}%` : ''}`;
    case 'ready': return t('updateReady');
    case 'installing': return t('restartingForUpdate');
    case 'offline': return t('updateOffline');
    case 'blocked_offline': return t('blockedOffline');
    case 'disabled': return t('updatesDisabled');
    default: return snapshot.error ? t('updateFailed') : '';
  }
}

function updateNotes(snapshot) {
  const notes = String(snapshot.release_notes || '').trim();
  if (!notes) return '';
  return `<div class="update-notes"><strong>${t('releaseNotes')}</strong><p>${escapeHtml(notes)}</p></div>`;
}

function updateProgressBar(snapshot) {
  if (snapshot.status !== 'downloading') return '';
  const percent = snapshot.download?.percent ?? 0;
  return `<div class="update-progress" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
    <div class="update-progress-bar" style="width:${percent}%"></div></div>`;
}

function updateActions(snapshot, { gate = false } = {}) {
  const buttons = [];
  if (snapshot.status === 'blocked_offline' || snapshot.status === 'error') {
    buttons.push(`<button class="button button-primary" data-update-action="check">${t('checkForUpdates')}</button>`);
  } else if (snapshot.status === 'ready') {
    buttons.push(`<button class="button button-primary" data-update-action="install">${t('installUpdate')}</button>`);
  } else if (snapshot.status === 'checking' || snapshot.status === 'installing') {
    buttons.push(`<button class="button button-primary" disabled>${snapshot.status === 'checking' ? t('updateChecking') : t('restartingForUpdate')}</button>`);
  } else if (snapshot.status !== 'downloading') {
    buttons.push(`<button class="button button-primary" data-update-action="install">${t('updateNow')}</button>`);
  }
  if (!snapshot.mandatory && !gate) {
    buttons.push(`<button class="button button-outline" data-update-action="later">${t('updateLater')}</button>`);
    if (snapshot.status !== 'ready' && snapshot.status !== 'downloading') {
      buttons.push(`<button class="button button-outline" data-update-action="skip">${t('skipVersion')}</button>`);
    }
  }
  return `<div class="update-actions">${buttons.join('')}</div>`;
}

function bannerHtml(snapshot) {
  return `<div class="update-banner-card">
    <div class="update-banner-text"><strong>${escapeHtml(updateStatusText(snapshot))}</strong>
      <span>${snapshot.status === 'downloading' ? t('downloadsInBackground') : escapeHtml(t('releaseNotes'))}</span></div>
    ${updateProgressBar(snapshot)}
    ${updateActions(snapshot)}
  </div>`;
}

function gateHtml(snapshot) {
  if (snapshot.status === 'blocked_offline') {
    return `<div class="update-gate-card">
      <div class="brand-mark">BS</div>
      <h2>${t('softwareUpdate')}</h2>
      <p>${escapeHtml(t('blockedOffline'))}</p>
      ${snapshot.error ? `<p class="error-text">${escapeHtml(explain(snapshot.error))}</p>` : ''}
      ${updateActions(snapshot, { gate: true })}
    </div>`;
  }
  return `<div class="update-gate-card">
    <div class="brand-mark">BS</div>
    <h2>${t('softwareUpdate')} ${escapeHtml(snapshot.latest_version || '')}</h2>
    <p>${escapeHtml(t('mandatoryUpdate'))} ${escapeHtml(t('mandatoryUpdateHint'))}</p>
    ${updateProgressBar(snapshot)}
    ${snapshot.error ? `<p class="error-text">${escapeHtml(explain(snapshot.error))}</p>` : ''}
    ${updateNotes(snapshot)}
    ${updateActions(snapshot, { gate: true })}
  </div>`;
}

function updateSettingsHtml(snapshot) {
  if (!snapshot) return `<div class="empty">${t('loading')}</div>`;
  const lastCheck = snapshot.last_check ? new Date(snapshot.last_check).toLocaleString() : t('neverChecked');
  return `<div class="update-settings">
    <div class="update-facts">
      <div><span>${t('currentVersion')}</span><strong>${escapeHtml(snapshot.current_version || '—')}</strong></div>
      <div><span>${t('lastChecked')}</span><strong>${escapeHtml(lastCheck)}</strong></div>
      <div><span>${t('status')}</span><strong>${escapeHtml(updateStatusText(snapshot) || '—')}</strong></div>
    </div>
    ${updateProgressBar(snapshot)}
    ${snapshot.error ? `<p class="error-text">${escapeHtml(explain(snapshot.error))}</p>` : ''}
    ${snapshot.latest_version && snapshot.update_available !== false ? updateNotes(snapshot) : ''}
    <div class="update-actions">
      <button class="button button-outline" data-update-action="check"${snapshot.status === 'checking' || !snapshot.enabled ? ' disabled' : ''}>${t('checkForUpdates')}</button>
      ${snapshot.status === 'ready' ? `<button class="button button-primary" data-update-action="install">${t('installUpdate')}</button>` : ''}
    </div>
  </div>`;
}

function paintUpdateSettings() {
  const target = $('#update-settings');
  if (target) target.innerHTML = updateSettingsHtml(updateView.snapshot);
}

function paintUpdates() {
  const snapshot = updateView.snapshot;
  if (!snapshot) return;
  const banner = $('#update-banner');
  const gate = $('#update-gate');
  const notice = snapshot.enabled && ['optional', 'mandatory', 'ready', 'downloading', 'error'].includes(snapshot.status);
  banner.hidden = !notice || snapshot.blocking;
  if (!banner.hidden) banner.innerHTML = bannerHtml(snapshot);
  gate.hidden = !snapshot.blocking;
  if (!gate.hidden) gate.innerHTML = gateHtml(snapshot);
  paintUpdateSettings();
}

async function runUpdateAction(action) {
  const api = window.somiti.updates;
  try {
    if (action === 'check') updateView.snapshot = await api.check();
    else if (action === 'install') {
      if (updateView.snapshot?.status === 'ready') {
        toast(t('restartingForUpdate'));
        updateView.snapshot = { ...updateView.snapshot, status: 'installing' };
        paintUpdates();
        await api.install();
      } else updateView.snapshot = await api.download();
    } else if (action === 'later') updateView.snapshot = await api.later();
    else if (action === 'skip') updateView.snapshot = await api.skip();
  } catch (error) {
    toast(explain(error.message));
  }
  paintUpdates();
}

async function initUpdates() {
  if (!window.somiti?.updates) return;
  try {
    updateView.snapshot = await window.somiti.updates.state();
    paintUpdates();
    window.somiti.updates.onEvent((snapshot) => {
      updateView.snapshot = snapshot;
      paintUpdates();
    });
  } catch (error) {
    console.error('Update state could not be loaded:', error.message);
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-update-action]');
  if (button && !button.disabled) runUpdateAction(button.dataset.updateAction);
});

async function renderPage(page) {
  state.page = page;
  state.search = '';
  nav();
  $('#page-title').textContent = t(page);
  const pages = {
    dashboard: renderDashboard, owners: () => renderEntity('owners'), buses: () => renderEntity('buses'),
    routes: () => renderEntity('routes'), members: () => renderEntity('members'),
    cashbook: renderCashbook, banks: renderBankManagement, reports: renderReports, cashInReport: renderCashInReport, cashOutReport: renderCashOutReport, users: renderUsers,
    settings: renderSettings, funds: () => renderEntity('funds'),
  };
  try { await (pages[page] || renderDashboard)(); }
  catch (error) { $('#content').innerHTML = `<div class="panel error-text">${escapeHtml(explain(error.message))}</div>`; }
}

$('#language-toggle').addEventListener('click', () => {
  state.language = state.language === 'en' ? 'bn' : 'en';
  localStorage.setItem('language', state.language);
  setLanguage();
  if (state.user) { nav(); $('#page-title').textContent = t(state.page); renderPage(state.page); }
  paintUpdates();
});
$('#logout').addEventListener('click', async () => {
  await window.somiti.auth.logout();
  state.user = null;
  showAuth();
});
showAuth().catch((error) => { $('#auth-error').textContent = explain(error.message); });
initUpdates();
