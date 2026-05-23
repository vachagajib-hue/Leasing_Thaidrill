function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // action=listSheets → คืนรายชื่อ tab ทั้งหมด (ใช้สำหรับหา tab name ที่ถูก)
    if (e && e.parameter && e.parameter.action === 'listSheets') {
      var names = ss.getSheets().map(function(s) { return s.getName(); });
      return ContentService.createTextOutput(JSON.stringify({ sheets: names }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // รองรับ query param ?sheet=ชื่อtab — ถ้าไม่ส่งใช้ Payment_Log
    var sheetName = (e && e.parameter && e.parameter.sheet) ? e.parameter.sheet : 'Payment_Log';
    var sheet = ss.getSheetByName(sheetName);

    // ถ้าหาชีตไม่เจอ ให้คืน error พร้อมรายชื่อ tab ที่มี (จะได้รู้ว่าต้องใช้ชื่อไหน)
    if (!sheet) {
      var available = ss.getSheets().map(function(s) { return s.getName(); });
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Sheet not found: ' + sheetName,
        availableSheets: available
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = sheet.getDataRange().getValues();

    // ค้นหาบรรทัดที่เป็นหัวข้อตาราง (Header)
    // เช็ค keyword หลายตัวเพื่อรองรับ sheet หลายแบบ
    var headerRowIndex = 0;
    for (var i = 0; i < Math.min(15, data.length); i++) {
      var rowString = data[i].join('').toLowerCase();
      if (rowString.includes('กำหนดชำระ') || rowString.includes('ชื่อลิสซิ่ง') ||
          rowString.includes('ลำดับที่') || rowString.includes('เลขที่เช็ค') ||
          rowString.includes('จำนวนเงินหน้าเช็ค') || rowString.includes('ค่าธรรมเนียม')) {
        headerRowIndex = i;
        break;
      }
    }
    
    var headers = data[headerRowIndex];
    var records = [];
    
    // วนลูปอ่านข้อมูลบรรทัดที่อยู่ถัดจากหัวข้อลงไป
    for (var r = headerRowIndex + 1; r < data.length; r++) {
      var row = data[r];
      var record = {};
      var hasData = false;
      
      for (var c = 0; c < headers.length; c++) {
        var header = headers[c] ? headers[c].toString().trim() : '';
        if (header !== '') {
          // เก็บค่าลงใน Object
          record[header] = row[c];
          // เช็คว่าแถวนี้มีข้อมูลจริงๆ (ไม่ใช่แถวว่าง)
          if (row[c] !== '' && row[c] !== null && row[c] !== undefined) {
            hasData = true;
          }
        }
      }
      
      // ถ้าแถวนั้นมีข้อมูลอย่างน้อย 1 ช่อง ถึงจะเก็บเข้า array
      if (hasData) {
        records.push(record);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify(records))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
