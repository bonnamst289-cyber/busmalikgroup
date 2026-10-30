const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { user: null, page: 'dashboard', language: localStorage.getItem('language') || 'en', search: '', owners: [], buses: [], routes: [], funds: [], members: [] };

const words = {
  en: {
    brand: 'Bus Malik Somiti', workspace: 'ASSOCIATION WORKSPACE', offline: 'Offline ready', logout: 'Sign out',
    dashboard: 'Dashboard', owners: 'Bus Owners', buses: 'Buses', routes: 'Routes',
    members: 'Members', finance: 'Income & Expense', cashbook: 'Cashbook', reports: 'Reports',
    users: 'Users & Permissions', settings: 'Settings & Backup', totalBuses: 'Total Buses', totalOwners: 'Bus Owners',
    totalRoutes: 'Routes', totalMembers: 'Members', funds: 'Funds',
    today: "Today's Collection", month: 'Monthly Collection',
    fundBalance: 'Total Fund Balance', expenses: 'Total Expenses', monthlyExpenses: 'Monthly Expenses',
    recent: 'Recent Transactions', fundsSummary: 'Fund Balances', add: 'Add New', search: 'Search records...',
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
    active: 'Active', inactive: 'Inactive',
    transferDone: 'Fund transfer recorded.', backupDone: 'Database backup saved.', restoreDone: 'Database restored. Sign in again.',
    passwordChanged: 'Password changed.', selectFund: 'Select fund', selectOwner: 'Select owner',
    selectRoute: 'Select route', selectBus: 'Select bus', selectMember: 'Select member',
    amountWords: 'All amounts are stored as integer poisha.',
    typeIncome: 'Income', typeExpense: 'Expense', other: 'Other', starting: 'Start date',
    account: 'Account', printOwner: 'Print Owner Info', permissions: 'Permissions', activityLog: 'Activity Log',
    loginHistory: 'Login History', disable: 'Disable', enable: 'Enable', showReport: 'Show Report',
    dailyCollection: 'Daily Collection', monthlyCollection: 'Monthly Collection', yearlyCollection: 'Yearly Collection',
    busWiseReport: 'Bus-wise Report', ownerWiseReport: 'Owner-wise Report', routeWiseReport: 'Route-wise Report',
    fundWiseReport: 'Fund-wise Report', incomeReport: 'Income Report', expenseReport: 'Expense Report',
    income_paisa: 'Income', expense_paisa: 'Expense', balance_paisa: 'Balance',
    period: 'Period', buses: 'Buses', success: 'Success', failed: 'Failed', repair: 'Repair',
    memberWiseReport: 'Member-wise Report',
    receiptsReport: 'Receipt Report',
    incomeVsExpense: 'Monthly Income vs Expense',
    noChartData: 'Add income or expense entries to see the chart.',
    amount_paisa: 'Amount',
    route_name: 'Route Name',
    fund_name: 'Fund Name',
    cashIn: 'Cash In',
    cashbook: 'Cashbook',
    totalCashIn: 'Total Cash In',
    totalDistributed: 'Total Fund Distribution',
    availableCash: 'Available Cash Balance',
    fundWiseBalance: 'Fund-wise Balance',
    cashInHistory: 'Cash In History',
    distributionHistory: 'Distribution History',
    distributeFunds: 'Fund Distribution',
    distributionAmount: 'Distribution Amount (BDT)',
    cashInNotice: 'Cash In includes recorded income transactions. Automatic route-based collection requires a trip completion workflow, which is not available in this project.',
    distributionSaved: 'Fund distribution saved.',
    duplicateDistribution: 'This distribution was already recorded.',
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
    distributionPositive: 'Distribution amount must be greater than zero.',
    distributionTooBig: 'Distribution cannot exceed the available cash balance.',
    incomeBelowDistribution: 'This change would make total income lower than the amount already distributed.',
    requestKeyRequired: 'A valid distribution request key is required.',
    requestKeyUsed: 'This distribution request key was already used for a different distribution.',
    routeNameRequired: 'Route name is required.',
    fundNameRequired: 'Fund name is required.',
    chooseActiveFund: 'Choose an active fund.',
    chooseTwoFunds: 'Choose two different funds.',
    validDateRequired: 'Enter a valid transaction date.',
    chooseDifferentFile: 'Choose a different database file.',
    backupFolderOnly: 'Only the configured backup folder can be opened.',
    backupCheckFailed: 'Backup integrity check failed: {0}',
    backupMissingTable: 'Backup is missing required table: {0}',
    tagline: 'Management System',
    income_categories: 'Income Categories',
    expense_categories: 'Expense Categories',
  },
  bn: {
    brand: 'বাস মালিক সমিতি', workspace: 'সমিতি ব্যবস্থাপনা', offline: 'অফলাইনে প্রস্তুত', logout: 'লগ আউট',
    dashboard: 'ড্যাশবোর্ড', owners: 'বাস মালিক', buses: 'বাসসমূহ', routes: 'রুটসমূহ',
    members: 'সদস্য', finance: 'আয় ও ব্যয়', cashbook: 'ক্যাশবুক', reports: 'রিপোর্ট',
    users: 'ব্যবহারকারী ও অনুমতি', settings: 'সেটিংস ও ব্যাকআপ', totalBuses: 'মোট বাস', totalOwners: 'বাস মালিক',
    funds: 'তহবিল',
    totalRoutes: 'রুট', 
    today: 'আজকের আদায়', month: 'মাসিক আদায়',
    fundBalance: 'মোট তহবিল', expenses: 'মোট ব্যয়',
    recent: 'সাম্প্রতিক লেনদেন', fundsSummary: 'তহবিলের স্থিতি', add: 'নতুন যোগ করুন', search: 'খুঁজুন...',
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
    active: 'সক্রিয়', inactive: 'নিষ্ক্রিয়',
    transferDone: 'তহবিল স্থানান্তর সংরক্ষিত।', backupDone: 'ডাটাবেস ব্যাকআপ সংরক্ষিত।', restoreDone: 'ডাটাবেস পুনরুদ্ধার হয়েছে। আবার লগ ইন করুন।',
    passwordChanged: 'পাসওয়ার্ড পরিবর্তন হয়েছে।', selectFund: 'তহবিল নির্বাচন', selectOwner: 'মালিক নির্বাচন',
    selectRoute: 'রুট নির্বাচন', selectBus: 'বাস নির্বাচন', selectMember: 'সদস্য নির্বাচন',
    amountWords: 'সব অর্থ পয়সার পূর্ণসংখ্যা হিসেবে সংরক্ষিত হয়।',
    typeIncome: 'আয়', typeExpense: 'ব্যয়', other: 'অন্যান্য', starting: 'শুরুর তারিখ',
    account: 'হিসাব', printOwner: 'মালিকের তথ্য প্রিন্ট', permissions: 'অনুমতি', activityLog: 'কার্যক্রম লগ',
    loginHistory: 'লগইন ইতিহাস', disable: 'নিষ্ক্রিয় করুন', enable: 'সক্রিয় করুন', showReport: 'রিপোর্ট দেখুন',
    dailyCollection: 'দৈনিক আদায়', monthlyCollection: 'মাসিক আদায়', yearlyCollection: 'বার্ষিক আদায়',
    busWiseReport: 'বাসভিত্তিক রিপোর্ট', ownerWiseReport: 'মালিকভিত্তিক রিপোর্ট', routeWiseReport: 'রুটভিত্তিক রিপোর্ট',
    fundWiseReport: 'তহবিলভিত্তিক রিপোর্ট', incomeReport: 'আয়ের রিপোর্ট', expenseReport: 'ব্যয়ের রিপোর্ট',
    income_paisa: 'আয়', expense_paisa: 'ব্যয়', balance_paisa: 'স্থিতি',
    period: 'সময়কাল', buses: 'বাস', success: 'সফল', failed: 'ব্যর্থ', repair: 'মেরামত',
    totalMembers: 'সদস্য',
    monthlyExpenses: 'এ মাসের ব্যয়',
    driver_mobile: 'চালকের মোবাইল',
    amount_paisa: 'পরিমাণ',
    route_name: 'রুটের নাম',
    fund_name: 'তহবিলের নাম',
    cashIn: 'ক্যাশ ইন',
    cashbook: 'ক্যাশবুক',
    totalCashIn: 'মোট ক্যাশ ইন',
    totalDistributed: 'মোট তহবিল বিতরণ',
    availableCash: 'উপলব্ধ ক্যাশ ব্যালেন্স',
    fundWiseBalance: 'তহবিলভিত্তিক স্থিতি',
    cashInHistory: 'ক্যাশ ইন ইতিহাস',
    distributionHistory: 'বিতরণ ইতিহাস',
    distributeFunds: 'তহবিল বিতরণ',
    distributionAmount: 'বিতরণের পরিমাণ (টাকা)',
    cashInNotice: 'ক্যাশ ইন-এ সংরক্ষিত আয়ের লেনদেন দেখানো হয়। ট্রিপ সম্পন্ন করার ব্যবস্থা এই প্রকল্পে নেই, তাই রুটভিত্তিক আয় স্বয়ংক্রিয়ভাবে যোগ হয় না।',
    distributionSaved: 'তহবিল বিতরণ সংরক্ষিত হয়েছে।',
    duplicateDistribution: 'এই বিতরণটি আগেই সংরক্ষিত হয়েছে।',
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
    distributionPositive: 'বণ্টানের পরিমাণ শূন্যের বেশি হতে হবে।',
    distributionTooBig: 'সহজলভ্য ব্যালেন্সের চেয়ে বেশি বণ্টন করা যাবে না।',
    incomeBelowDistribution: 'এই পরিবর্তন করলে মোট আয় ইতোমধ্যে বণ্টিত টাকার চেয়ে কম হয়ে যাবে।',
    requestKeyRequired: 'সঠিক বণ্টনের অনুরোধ কী দরকার।',
    requestKeyUsed: 'এই কী দিয়ে আগেই অন্য একটি বণ্টন হয়েছে।',
    routeNameRequired: 'রুটের নাম দিতে হবে।',
    fundNameRequired: 'তহবিলের নাম দিতে হবে।',
    chooseActiveFund: 'সক্রিয় তহবিল বেছে নিন।',
    chooseTwoFunds: 'দুইটি আলাদা তহবিল বেছে নিন।',
    validDateRequired: 'সঠিক লেনদেনের তারিখ দিন।',
    chooseDifferentFile: 'অন্য একটি ডাটাবেস ফাইল বেছে নিন।',
    backupFolderOnly: 'শুধু নির্ধারিত ব্যাকআপ ফোল্ডারই খোলা যাবে।',
    backupCheckFailed: 'ব্যাকআপ যাচাই ব্যর্থ: {0}',
    backupMissingTable: 'ব্যাকআপে প্রয়োজনীয় টেবিল নেই: {0}',
    tagline: 'ব্যবস্থাপনা সফটওয়্যার',
    income_categories: 'আয়ের খাত',
    expense_categories: 'ব্যয়ের খাত',
  }
};

const menu = [
  ['dashboard', '⌂'], ['owners', '♙'], ['buses', '▣'], ['routes', '⇄'],
  ['members', '♧'], ['finance', '◈'], ['cashbook', '৳'], ['reports', '▤'], ['users', '♙'], ['settings', '⚙']
];

const entityConfig = {
  owners: { title: 'owners', fields: [['name', 'text', true], ['nominee_name', 'text'], ['father_name', 'text'], ['mobile', 'tel'], ['address', 'textarea'], ['join_date', 'date'], ['status', 'active-status'], ['photo_path', 'photo']] },
  routes: { title: 'routes', fields: [['name', 'text', true, 'route_name'], ['charge_bdt', 'number', true, 'amount_bdt']] },
  buses: { title: 'buses', fields: [['registration_number', 'text', true], ['owner_id', 'owner', true], ['route_id', 'route'], ['driver_name', 'text'], ['driver_mobile', 'tel'], ['helper_name', 'text'], ['bus_type', 'text'], ['status', 'bus-status']] },
  members: { title: 'members', fields: [['name', 'text', true], ['father_name', 'text'], ['mobile', 'tel'], ['address', 'textarea'], ['membership_date', 'date', true], ['member_type', 'text'], ['status', 'active-status'], ['monthly_fee_bdt', 'number', true]] },
  funds: { title: 'funds', fields: [['name', 'text', true, 'route_name'], ['opening_balance_bdt', 'number', true, 'amount_bdt']] },
  income_categories: { title: 'income_categories', fields: [['name', 'text', true], ['is_active', 'checkbox']] },
  expense_categories: { title: 'expense_categories', fields: [['name', 'text', true], ['is_active', 'checkbox']] }
};

function t(key) { return words[state.language][key] || key; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function fileUrl(value) { return value ? `file:///${encodeURI(String(value).replace(/\\/g, '/'))}` : ''; }
function formatMoney(paisa) { return `৳ ${new Intl.NumberFormat(state.language === 'bn' ? 'bn-BD' : 'en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((Number(paisa) || 0) / 100)}`; }
function today() { return new Date().toISOString().slice(0, 10); }
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
  [/^Distribution amount must be greater than zero\.$/, 'distributionPositive'],
  [/^Distribution cannot exceed the available cash balance\.$/, 'distributionTooBig'],
  [/^This change would make total income lower than the amount already distributed\.$/, 'incomeBelowDistribution'],
  [/^A valid distribution request key is required\.$/, 'requestKeyRequired'],
  [/^This distribution request key was already used for a different distribution\.$/, 'requestKeyUsed'],
  [/^Route name is required\.$/, 'routeNameRequired'],
  [/^Fund name is required\.$/, 'fundNameRequired'],
  [/^Choose an active fund\.$/, 'chooseActiveFund'],
  [/^Choose two different funds\.$/, 'chooseTwoFunds'],
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
  const data = await window.somiti.dashboard.get();
  const values = data.totals;
  const recentRows = data.recent.map((row) => [row.date, row.category, row.party || '—', row.transaction_type === 'income' ? t('typeIncome') : t('typeExpense'), formatMoney(row.amount_paisa)]);
  const max = Math.max(1, ...data.funds.map((fund) => fund.balance_paisa));
  const fundRows = data.funds.map((fund) => `<div class="fund-row"><span class="fund-dot"></span>${escapeHtml(fund.name)}<strong>${formatMoney(fund.balance_paisa)}</strong></div>`).join('');
  const monthly = data.monthly || [];
  const trendMax = Math.max(1, ...monthly.flatMap((row) => [row.income_paisa, row.expense_paisa]));
  const barClass = (value) => `chart-bar-${value <= 0 ? 0 : Math.min(10, Math.max(1, Math.ceil(value / trendMax * 10)))}`;
  const trend = monthly.map((row) => `<div class="trend-column" title="${escapeHtml(row.period)} · ${t('typeIncome')} ${formatMoney(row.income_paisa)} · ${t('typeExpense')} ${formatMoney(row.expense_paisa)}">
    <div class="trend-bars"><span class="chart-bar trend-income ${barClass(row.income_paisa)}"></span><span class="chart-bar trend-expense ${barClass(row.expense_paisa)}"></span></div>
    <span class="chart-label">${escapeHtml(row.period)}</span></div>`).join('');
  const cards = [
    [t('totalBuses'), values.buses, '▣'], [t('totalOwners'), values.owners, '♙'], [t('totalRoutes'), values.routes, '⇄'], [t('totalMembers'), values.members, '♧'],
    [t('today'), formatMoney(values.today_collection_paisa), '৳'], [t('month'), formatMoney(values.month_collection_paisa), '◷'],
    [t('monthlyExpenses'), formatMoney(values.month_expenses_paisa), '↘'], [t('fundBalance'), formatMoney(values.funds_paisa), '◈']
  ];
  $('#content').innerHTML = `<div class="cards">${cards.map((item) => card(...item)).join('')}</div>
    <div class="panel"><div class="panel-heading"><h2>${t('incomeVsExpense')}</h2><span class="legend"><span><i class="legend-income"></i>${t('typeIncome')}</span><span><i class="legend-expense"></i>${t('typeExpense')}</span></span></div>
      ${trend ? `<div class="trend">${trend}</div>` : `<div class="empty">${t('noChartData')}</div>`}</div>
    <div class="dashboard-grid"><div class="panel"><div class="panel-heading"><h2>${t('recent')}</h2><button class="button button-outline button-small" data-go="finance">${t('ledger')}</button></div>
      ${table([t('date'), t('category'), t('name'), t('transaction_type'), t('amount_bdt')], recentRows)}</div>
      <div class="panel"><div class="panel-heading"><h2>${t('fundsSummary')}</h2></div>${fundRows || `<div class="empty">${t('noRows')}</div>`}
      <div class="chart">${data.funds.map((fund) => {
        const bucket = fund.balance_paisa <= 0 ? 0 : Math.min(10, Math.max(1, Math.ceil(fund.balance_paisa / max * 10)));
        return `<div class="chart-column" title="${escapeHtml(fund.name)}: ${formatMoney(fund.balance_paisa)}"><div class="chart-bar chart-bar-${bucket}"></div><span class="chart-label">${escapeHtml(fund.name.slice(0, 8))}</span></div>`;
      }).join('')}</div></div></div>`;
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => renderPage(button.dataset.go)));
}

function table(headers, rows, actions = null) {
  if (!rows.length) return `<div class="empty">${t('noRows')}</div>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}${actions ? `<th>${t('actions')}</th>` : ''}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}${actions ? `<td>${actions(row)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

function ownerName(id) { return state.owners.find((item) => Number(item.id) === Number(id))?.name || '—'; }
function routeName(id) { return state.routes.find((item) => Number(item.id) === Number(id))?.name || '—'; }
function busName(id) { return state.buses.find((item) => Number(item.id) === Number(id))?.registration_number || '—'; }
function memberName(id) { return state.members.find((item) => Number(item.id) === Number(id))?.name || '—'; }
function status(value) {
  const translationKey = { Active: 'active', Inactive: 'inactive', Repair: 'repair', Success: 'success', Failed: 'failed' }[value];
  return `<span class="status ${String(value).toLowerCase()}">${escapeHtml(translationKey ? t(translationKey) : value)}</span>`;
}
function standardColumns(entity) {
  const columns = {
    owners: [['owner_code', 'owner_code'], ['name', 'name'], ['mobile', 'mobile'], ['nominee_name', 'nominee_name'], ['join_date', 'join_date'], ['status', 'status'], ['address', 'address']],
    routes: [['name', 'route_name'], ['charge_paisa', 'amount_bdt']],
    buses: [['registration_number', 'registration_number'], ['owner_id', 'owner_id'], ['route_id', 'route_id'], ['bus_type', 'bus_type'], ['driver_name', 'driver_name'], ['driver_mobile', 'driver_mobile'], ['status', 'status']],
    members: [['member_code', 'member_code'], ['name', 'name'], ['father_name', 'father_name'], ['mobile', 'mobile'], ['member_type', 'member_type'], ['monthly_fee_paisa', 'monthly_fee_bdt'], ['status', 'status']],
    funds: [['name', 'route_name'], ['opening_balance_paisa', 'amount_bdt'], ['is_active', 'status']],
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

async function renderEntity(entity) {
  const cfg = entityConfig[entity];
  const records = await window.somiti.records.list(entity, state.search);
  if (entity === 'funds') state.funds = records.filter((fund) => fund.is_active);
  const columns = standardColumns(entity);
  const tableRows = records.map((record) => `<tr>${columns.map(([field]) => `<td>${displayValue(entity, record, field)}</td>`).join('')}<td><div class="action-cell">${['owners', 'buses', 'routes'].includes(entity) ? `<button class="button button-outline button-small" data-account-entity="${entity}" data-account-id="${record.id}">${t('account')}</button>` : ''}<button class="button button-outline button-small" data-edit="${record.id}">${t('edit')}</button><button class="button button-danger button-small" data-delete="${record.id}">${t('delete')}</button></div></td></tr>`).join('');
  $('#content').innerHTML = `<div class="toolbar"><input id="entity-search" class="search" placeholder="${t('search')}" value="${escapeHtml(state.search)}"><span class="spacer"></span><button id="add-record" class="button button-primary">＋ ${t('add')}</button></div>
    ${records.length ? `<div class="table-wrap"><table><thead><tr>${columns.map(([, title]) => `<th>${escapeHtml(label(title))}</th>`).join('')}<th>${t('actions')}</th></tr></thead><tbody>${tableRows}</tbody></table></div>` : `<div class="panel empty">${t('noRows')}</div>`}`;
  const search = $('#entity-search');
  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    state.search = search.value;
    searchTimer = setTimeout(() => renderEntity(entity), 180);
  });
  $('#add-record').addEventListener('click', () => openRecordForm(entity));
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
      const { route, buses } = await window.somiti.routes.account(id);
      const rows = buses.map((bus) => `<tr><td>${escapeHtml(bus.registration_number)}</td><td>${escapeHtml(bus.owner_name)}</td><td>${status(bus.status)}</td></tr>`).join('');
      showAccountDialog(route.name, `<p class="subheading">${t('amount_bdt')}: ${formatMoney(route.charge_paisa)}</p><h3>${t('buses')}</h3>${dataTable([t('registration_number'), t('owner_id'), t('status')], rows)}`);
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
  if (kind === 'route') return `<div class="field"><label>${labelText}</label><select name="${field}">${optionsHtml(state.routes.map((item) => ({ id: item.id, label: `${item.route_number} — ${item.name}` })), value, t('selectRoute'))}</select></div>`;
  if (kind === 'bus-status') return statusSelect(field, labelText, ['Active', 'Inactive', 'Repair'], value);
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
    for (const [source, target] of [['charge_bdt', 'charge_paisa'], ['opening_balance_bdt', 'opening_balance_paisa'], ['monthly_fee_bdt', 'monthly_fee_paisa']]) {
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

function renderCustomTable(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join('')}<th>${t('actions')}</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((item) => `<td>${item}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function selectField(name, title, options, required = true, selected = '') {
  return `<div class="field"><label>${title}</label><select name="${name}" ${required ? 'required' : ''}>${optionsHtml(options, selected, t('other'))}</select></div>`;
}


async function renderFinance() {
  const filters = { from: `${new Date().getFullYear()}-01-01`, to: '9999-12-31' };
  const [transactions, incomeCats, expenseCats] = await Promise.all([
    window.somiti.finance.list(filters), window.somiti.records.list('income_categories'), window.somiti.records.list('expense_categories')
  ]);
  const admin = state.user.role === 'admin';
  const headers = ['date', 'transaction_type', 'category', 'fund_id', 'party', 'amount_bdt', 'receiver_name', 'description_label'];
  const rows = transactions.map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${item.transaction_type === 'income' ? t('typeIncome') : t('typeExpense')}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.fund_name)}</td><td>${escapeHtml(item.party || '—')}</td><td>${formatMoney(item.amount_paisa)}</td><td>${escapeHtml(item.receiver_name || '')}</td><td>${escapeHtml(item.description || '')}</td><td>${admin ? `<div class="action-cell"><button class="button button-outline button-small" data-edit-transaction="${item.id}">${t('edit')}</button><button class="button button-danger button-small" data-delete-transaction="${item.id}">${t('delete')}</button></div>` : ''}</td></tr>`).join('');
  $('#content').innerHTML = `<div class="toolbar"><button class="button button-primary" id="income-btn">＋ ${t('addIncome')}</button><button class="button button-outline" id="expense-btn">＋ ${t('addExpense')}</button><button class="button button-outline" id="transfer-btn">${t('transfer')}</button><span class="spacer"></span><button class="button button-outline" data-categories="income_categories">${t('typeIncome')} · ${t('category')}</button><button class="button button-outline" data-categories="expense_categories">${t('typeExpense')} · ${t('category')}</button></div>
    <div class="panel"><div class="panel-heading"><h2>${t('ledger')}</h2>${admin ? `<span class="muted">${t('correctionHint')}</span>` : ''}</div>${rows ? `<div class="table-wrap"><table><thead><tr>${headers.map((key) => `<th>${label(key)}</th>`).join('')}${admin ? `<th>${t('actions')}</th>` : ''}</tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}</div>`;
  $('#income-btn').addEventListener('click', () => openFinanceForm('income', incomeCats));
  $('#expense-btn').addEventListener('click', () => openFinanceForm('expense', expenseCats));
  $('#transfer-btn').addEventListener('click', openTransferForm);
  $$('[data-categories]').forEach((button) => button.addEventListener('click', () => renderPage(button.dataset.categories)));
  $$('[data-edit-transaction]').forEach((button) => button.addEventListener('click', () => {
    const item = transactions.find((transaction) => transaction.id === Number(button.dataset.editTransaction));
    openFinanceForm(item.transaction_type, item.transaction_type === 'income' ? incomeCats : expenseCats, item);
  }));
  $$('[data-delete-transaction]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm(t('confirmDelete'))) return;
    try { await window.somiti.finance.delete(Number(button.dataset.deleteTransaction)); toast(t('saved')); renderFinance(); }
    catch (error) { toast(explain(error.message)); }
  }));
}

async function openFinanceForm(type, categories, existing = null) {
  const options = categories.map((item) => ({ id: item.name, label: item.name }));
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  const money = (value) => ((Number(value) || 0) / 100).toFixed(2);
  modal.innerHTML = `<form class="modal"><h2>${existing ? `${t('edit')} · ${type === 'income' ? t('addIncome') : t('addExpense')}` : (type === 'income' ? t('addIncome') : t('addExpense'))}</h2><div class="form-grid">
    <div class="field"><label>${t('date')}</label><input name="date" type="date" value="${escapeHtml(existing?.date || today())}" required></div>
    ${selectField('category', t('category'), options, true, existing?.category)}
    ${selectField('fund_id', t('fund_id'), state.funds.map((fund) => ({ id: fund.id, label: fund.name })), true, existing?.fund_id)}
    <div class="field"><label>${t('amount_bdt')}</label><input name="amount_bdt" type="number" min="0.01" step="0.01" value="${existing ? money(existing.amount_paisa) : ''}" required></div>
    ${selectField('owner_id', t('owner_id'), state.owners.map((item) => ({ id: item.id, label: item.name })), false, existing?.owner_id)}
    ${selectField('member_id', t('member_id'), state.members.map((item) => ({ id: item.id, label: item.name })), false, existing?.member_id)}
    ${selectField('bus_id', t('bus_id'), state.buses.map((item) => ({ id: item.id, label: item.registration_number })), false, existing?.bus_id)}
    <div class="field"><label>${t('receiver_name')}</label><input name="receiver_name" value="${escapeHtml(existing?.receiver_name || '')}"></div>
    <div class="field"><label>${t('reference_number')}</label><input name="reference_number" value="${escapeHtml(existing?.reference_number || '')}"></div>
    <div class="field full"><label>${t('description_label')}</label><textarea name="description">${escapeHtml(existing?.description || '')}</textarea></div>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button class="button button-primary">${t('save')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  modal.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.transaction_type = type;
    data.amount_paisa = Math.round(Number(data.amount_bdt) * 100);
    data.fund_id = Number(data.fund_id);
    for (const field of ['owner_id', 'member_id', 'bus_id']) data[field] = data[field] ? Number(data[field]) : null;
    delete data.amount_bdt;
    try {
      if (existing) {
        data.id = existing.id;
        await window.somiti.finance.update(data);
      } else {
        const result = await window.somiti.finance.post(data);
        if (result.receipt) window.somiti.receipt.open(result.receipt.id).catch((error) => toast(explain(error.message)));
      }
      modal.remove();
      toast(t('saved'));
      renderFinance();
    } catch (error) { toast(explain(error.message)); }
  });
}


function openTransferForm() {
  const funds = state.funds.map((item) => ({ id: item.id, label: item.name }));
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${t('transfer')}</h2><div class="form-grid">
    ${selectField('from_fund_id', t('from_fund_id'), funds)}
    ${selectField('to_fund_id', t('to_fund_id'), funds)}
    <div class="field"><label>${t('date')}</label><input name="date" type="date" value="${today()}" required></div>
    <div class="field"><label>${t('amount_bdt')}</label><input name="amount_bdt" type="number" min="0.01" step="0.01" required></div>
    <div class="field full"><label>${t('description')}</label><textarea name="description"></textarea></div>
    </div><div class="modal-actions"><button type="button" class="button button-outline" data-cancel>${t('cancel')}</button><button class="button button-primary">${t('save')}</button></div></form>`;
  $('#modal-root').replaceChildren(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-cancel]')) modal.remove(); });
  modal.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.from_fund_id = Number(data.from_fund_id); data.to_fund_id = Number(data.to_fund_id);
    data.amount_paisa = Math.round(Number(data.amount_bdt) * 100);
    delete data.amount_bdt;
    try { await window.somiti.finance.transfer(data); modal.remove(); toast(t('transferDone')); renderFinance(); }
    catch (error) { toast(explain(error.message)); }
  });
}

async function renderCashbook() {
  const data = await window.somiti.cashbook.get();
  const metrics = [
    [t('totalCashIn'), formatMoney(data.totals.cash_in_paisa), '↗'],
    [t('totalDistributed'), formatMoney(data.totals.distributed_paisa), '⇄'],
    [t('availableCash'), formatMoney(data.totals.available_paisa), '৳']
  ];
  const incomeRows = data.income.map((item) => [
    escapeHtml(item.date), escapeHtml(item.category), escapeHtml(item.party || '—'),
    escapeHtml(item.registration_number || '—'), formatMoney(item.amount_paisa)
  ]);
  const distributionRows = data.distributions.map((item) => [
    escapeHtml(item.date), escapeHtml(item.fund_name), formatMoney(item.amount_paisa)
  ]);
  const fundRows = data.funds.map((fund) => [
    escapeHtml(fund.name), formatMoney(fund.balance_paisa), formatMoney(fund.distributed_paisa)
  ]);
  const requestKey = window.crypto.randomUUID();
  const fundOptions = data.funds.map((fund) => `<option value="${fund.id}">${escapeHtml(fund.name)}</option>`).join('');
  $('#content').innerHTML = `<div class="notice">${t('cashInNotice')}</div>
    <div class="cards">${metrics.map(([title, amount, icon]) => card(title, amount, icon)).join('')}</div>
    <div class="panel"><div class="panel-heading"><h2>${t('distributeFunds')}</h2><button id="cashbook-income" class="button button-outline">${t('addIncome')}</button></div>
      <form id="distribution-form" class="form-grid">
        <div class="field"><label>${t('fund_id')}</label><select name="fund_id" required><option value="">${t('selectFund')}</option>${fundOptions}</select></div>
        <div class="field"><label>${t('distributionAmount')}</label><input name="amount_bdt" type="number" min="0.01" step="0.01" max="${Math.max(0, data.totals.available_paisa / 100).toFixed(2)}" required></div>
        <div class="field"><button type="submit" class="button button-primary">${t('save')}</button></div>
      </form></div>
    <div class="dashboard-grid">
      <div class="panel"><div class="panel-heading"><h2>${t('fundWiseBalance')}</h2></div>
        ${table([t('fund_id'), t('balance_paisa'), t('totalDistributed')], fundRows)}</div>
      <div class="panel"><div class="panel-heading"><h2>${t('distributionHistory')}</h2></div>
        ${table([t('date'), t('fund_id'), t('amount_bdt')], distributionRows)}</div>
    </div>
    <div class="panel"><div class="panel-heading"><h2>${t('cashInHistory')}</h2></div>
      ${table([t('date'), t('category'), t('party'), t('bus'), t('amount_bdt')], incomeRows)}</div>`;
  $('#cashbook-income').addEventListener('click', () => renderPage('finance'));
  $('#distribution-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    const distribution = Object.fromEntries(new FormData(form).entries());
    distribution.fund_id = Number(distribution.fund_id);
    distribution.amount_paisa = Math.round(Number(distribution.amount_bdt) * 100);
    distribution.request_key = requestKey;
    delete distribution.amount_bdt;
    try {
      const result = await window.somiti.cashbook.distribute(distribution);
      toast(result.duplicate ? t('duplicateDistribution') : t('distributionSaved'));
      await renderCashbook();
    } catch (error) {
      submit.disabled = false;
      toast(explain(error.message));
    }
  });
}

async function renderReports() {
  $('#content').innerHTML = `<div class="panel"><div class="report-filters"><div class="field"><label>${t('reportType')}</label><select id="report-type">
    <option value="daily">${t('dailyCollection')}</option><option value="monthly">${t('monthlyCollection')}</option><option value="yearly">${t('yearlyCollection')}</option>
    <option value="buses">${t('busWiseReport')}</option><option value="owners">${t('ownerWiseReport')}</option><option value="routes">${t('routeWiseReport')}</option>
    <option value="members">${t('memberWiseReport')}</option><option value="receipts">${t('receiptsReport')}</option><option value="funds">${t('fundWiseReport')}</option>
    <option value="income">${t('incomeReport')}</option><option value="expense">${t('expenseReport')}</option><option value="transactions">${t('transactions')}</option>
    </select></div>
    <div class="field"><label>${t('from')}</label><input id="report-from" type="date" value="${new Date().getFullYear()}-01-01"></div>
    <div class="field"><label>${t('to')}</label><input id="report-to" type="date" value="${today()}"></div>
    <button id="run-report" class="button button-primary">${t('showReport')}</button><span class="spacer"></span><button id="pdf-report" class="button button-outline">${t('exportPdf')}</button><button id="excel-report" class="button button-outline">${t('exportExcel')}</button></div><div id="report-results" class="empty">${t('loading')}</div></div>`;
  let reportRows = [];
  let headers = [];
  const run = async () => {
    const type = $('#report-type').value;
    reportRows = await window.somiti.reports.get({ type, from: $('#report-from').value, to: $('#report-to').value });
    headers = reportRows.length ? Object.keys(reportRows[0]) : [];
    const display = reportRows.map((row) => headers.map((key) => key.endsWith('_paisa') ? formatMoney(row[key]) : escapeHtml(row[key] ?? '')));
    $('#report-results').innerHTML = display.length ? renderCustomTable(headers.map((key) => t(key)), display) : `<div class="empty">${t('noRows')}</div>`;
  };
  $('#run-report').addEventListener('click', run);
  $('#pdf-report').addEventListener('click', async () => {
    if (!reportRows.length) { toast(t('noRows')); return; }
    try { const file = await window.somiti.export.pdf({
      title: $('#report-type').selectedOptions[0].textContent,
      headers: headers.map(t),
      rows: reportRows.map((row) => headers.map((key) => key.endsWith('_paisa') ? formatMoney(row[key]) : row[key]))
    }); if (file) toast(file); }
    catch (error) { toast(explain(error.message)); }
  });
  $('#excel-report').addEventListener('click', async () => {
    if (!reportRows.length) { toast(t('noRows')); return; }
    try { const file = await window.somiti.export.excel({
      title: $('#report-type').selectedOptions[0].textContent,
      headers: headers.map(t),
      rows: reportRows.map((row) => headers.map((key) => key.endsWith('_paisa') ? formatMoney(row[key]) : row[key]))
    }); if (file) toast(file); }
    catch (error) { toast(explain(error.message)); }
  });
  await run();
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
  const permissionItems = ['owners', 'buses', 'routes', 'members', 'funds', 'finance'];
  const deletableItems = ['owners', 'buses', 'routes', 'members', 'funds'];
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<form class="modal"><h2>${existing ? t('permissions') : `${t('add')} · ${t('users')}`}</h2><div class="form-grid">
    <div class="field"><label>${t('full_name')}</label><input name="full_name" value="${escapeHtml(existing?.full_name || '')}" required></div>
    ${existing ? '' : `<div class="field"><label>${t('username')}</label><input name="username" required></div>
    <div class="field"><label>${t('password')}</label><input name="password" type="password" minlength="8" required></div>
    <div class="field"><label>${t('role')}</label><select name="role"><option value="staff">${t('staff')}</option><option value="admin">${t('administrator')}</option></select></div>`}
    <div class="field full"><label>${t('staffAccess')}</label>${permissionItems.map((item) => `<label><input type="checkbox" name="permission_manage_${item}" ${permissions[`manage_${item}`] ? 'checked' : ''}> ${t('manage')} · ${t(item)}</label>${deletableItems.includes(item) ? `<label><input type="checkbox" name="permission_delete_${item}" ${permissions[`delete_${item}`] ? 'checked' : ''}> ${t('delete')} · ${t(item)}</label>` : ''}`).join('')}</div>
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
    <div class="panel"><div class="panel-heading"><h2>${t('receipt')}</h2></div>${receiptRows ? `<div class="table-wrap"><table><thead><tr><th>${t('receipt_number')}</th><th>${t('date')}</th><th>${t('party')}</th><th>${t('category')}</th><th>${t('amount_bdt')}</th><th>${t('actions')}</th></tr></thead><tbody>${receiptRows}</tbody></table></div>` : `<div class="empty">${t('noRows')}</div>`}</div>`;
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

async function renderPage(page) {
  state.page = page;
  state.search = '';
  nav();
  $('#page-title').textContent = t(page);
  const pages = {
    dashboard: renderDashboard, owners: () => renderEntity('owners'), buses: () => renderEntity('buses'),
    routes: () => renderEntity('routes'), members: () => renderEntity('members'),
    finance: renderFinance, cashbook: renderCashbook, reports: renderReports, users: renderUsers,
    settings: renderSettings, funds: () => renderEntity('funds'),
    income_categories: () => renderEntity('income_categories'), expense_categories: () => renderEntity('expense_categories')
  };
  try { await (pages[page] || renderDashboard)(); }
  catch (error) { $('#content').innerHTML = `<div class="panel error-text">${escapeHtml(explain(error.message))}</div>`; }
}

$('#language-toggle').addEventListener('click', () => {
  state.language = state.language === 'en' ? 'bn' : 'en';
  localStorage.setItem('language', state.language);
  setLanguage();
  if (state.user) { nav(); $('#page-title').textContent = t(state.page); renderPage(state.page); }
});
$('#logout').addEventListener('click', async () => {
  await window.somiti.auth.logout();
  state.user = null;
  showAuth();
});
showAuth().catch((error) => { $('#auth-error').textContent = explain(error.message); });
