/**
 * ==========================================================================
 * GOOGLE APPS SCRIPT DATABASE API FOR TEACHER ATTENDANCE SYSTEM
 * ==========================================================================
 * 
 * របៀបដំឡើង (SETUP INSTRUCTIONS):
 * 1. បង្កើត Google Sheet ថ្មីមួយនៅក្នុង Google Drive (https://sheets.new)
 * 2. ចូលទៅកាន់ Extensions (ផ្នែកបន្ថែម) -> Apps Script
 * 3. លុបកូដចាស់ៗចោល រួចចម្លង (Copy) កូដខាងក្រោមនេះទាំងស្រុងទៅបិទភ្ជាប់ (Paste)
 * 4. ចុច Save (រូបតំណាងថាស)
 * 5. ចុច Deploy -> New deployment
 *    - Select type: Web app
 *    - Description: Attendance System API
 *    - Execute as: Me (អាសយដ្ឋាន Gmail របស់អ្នក)
 *    - Who has access: Anyone (អ្នករាល់គ្នា)  <-- សំខាន់ណាស់!
 * 6. ចុច Deploy -> Authorize Access (អនុញ្ញាតសិទ្ធិ) -> Advanced -> Go to ... (unsafe) -> Allow
 * 7. ចម្លង (Copy) អាសយដ្ឋាន Web App URL ដែលទទួលបាន យកទៅបិទភ្ជាប់ក្នុងប្រព័ន្ធ (ការកំណត់ -> អាសយដ្ឋាន Google Sheet Web App URL)
 */

function doGet(e) {
  initSheets();
  
  var db = {
    settings: getSettingsData(),
    users: getSheetDataAsArray("Users"),
    teachers: getSheetDataAsArray("Teachers"),
    attendance: getSheetDataAsArray("Attendance")
  };
  
  return ContentService.createTextOutput(JSON.stringify(db))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    initSheets();
    
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: "No post data received!" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    
    if (action === "sync") {
      if (data.settings) saveSettingsData(data.settings);
      if (data.users) saveArrayToSheet("Users", data.users, ["username", "password", "displayName", "role"]);
      if (data.teachers) saveArrayToSheet("Teachers", data.teachers, ["id", "name", "gender", "phone", "subject", "position", "status"]);
      if (data.attendance) saveArrayToSheet("Attendance", data.attendance, ["id", "teacherId", "date", "time", "session", "status", "method", "remark"]);
      
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "ទិន្នន័យត្រូវបានធ្វើសមកាលកម្មជោគជ័យ!" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Invalid action!" }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

/* ==========================================================================
   DATABASE HELPER CORE FUNCTIONS
   ========================================================================== */
function getSheetSafe(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    var headers = [];
    if (name === "Settings") headers = ["Key", "Value"];
    else if (name === "Users") headers = ["username", "password", "displayName", "role"];
    else if (name === "Teachers") headers = ["id", "name", "gender", "phone", "subject", "position", "status"];
    else if (name === "Attendance") headers = ["id", "teacherId", "date", "time", "session", "status", "method", "remark"];
    
    if (headers.length > 0) {
      sheet.appendRow(headers);
    }
  }
  return sheet;
}

function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  getSheetSafe("Settings");
  getSheetSafe("Users");
  getSheetSafe("Teachers");
  getSheetSafe("Attendance");
  
  var defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && defaultSheet.getLastRow() === 0) {
    ss.deleteSheet(defaultSheet);
  }
}

function getSettingsData() {
  var sheet = getSheetSafe("Settings");
  var rows = sheet.getDataRange().getValues();
  var settings = {};
  
  for (var i = 1; i < rows.length; i++) {
    var key = rows[i][0];
    var val = rows[i][1];
    
    if (val && (val.toString().indexOf("{") === 0 || val.toString().indexOf("[") === 0)) {
      try {
        settings[key] = JSON.parse(val);
      } catch (e) {
        settings[key] = val;
      }
    } else {
      if (val === "true") settings[key] = true;
      else if (val === "false") settings[key] = false;
      else settings[key] = val;
    }
  }
  return settings;
}

function saveSettingsData(settings) {
  var sheet = getSheetSafe("Settings");
  sheet.clear();
  sheet.appendRow(["Key", "Value"]);
  
  for (var key in settings) {
    var val = settings[key];
    if (val !== undefined && val !== null) {
      if (typeof val === "object") {
        val = JSON.stringify(val);
      }
      sheet.appendRow([key, val.toString()]);
    } else {
      sheet.appendRow([key, ""]);
    }
  }
}

function getSheetDataAsArray(sheetName) {
  var sheet = getSheetSafe(sheetName);
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  
  var headers = rows[0];
  var data = [];
  
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var record = {};
    for (var j = 0; j < headers.length; j++) {
      record[headers[j]] = row[j];
    }
    data.push(record);
  }
  return data;
}

function saveArrayToSheet(sheetName, array, headers) {
  var sheet = getSheetSafe(sheetName);
  sheet.clear();
  sheet.appendRow(headers);
  
  if (array.length === 0) return;
  
  var rows = [];
  for (var i = 0; i < array.length; i++) {
    var record = array[i];
    var row = [];
    for (var j = 0; j < headers.length; j++) {
      var val = record[headers[j]];
      row.push(val !== undefined && val !== null ? val.toString() : "");
    }
    rows.push(row);
  }
  
  var maxRows = sheet.getMaxRows();
  var neededRows = rows.length + 1;
  if (maxRows < neededRows) {
    sheet.insertRowsAfter(maxRows, neededRows - maxRows);
  }
  
  var maxCols = sheet.getMaxColumns();
  var neededCols = headers.length;
  if (maxCols < neededCols) {
    sheet.insertColumnsAfter(maxCols, neededCols - maxCols);
  }
  
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}
