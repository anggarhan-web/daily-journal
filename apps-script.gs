var HEADERS = ["ID","Tanggal","Judul","Catatan","Kategori","Produktivitas","Mood","Timestamp"];

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Jurnal") || ss.insertSheet("Jurnal");
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#f0efe9");
    sh.setFrozenRows(1);
  }
  var rows = Math.max(sh.getMaxRows() - 1, 1);
  sh.getRange(2, 1, rows, 2).setNumberFormat("@");
  sh.getRange(2, 8, rows, 1).setNumberFormat("@");
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function str_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return (v === null || v === undefined) ? "" : String(v);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === "list") return json_({status: "ok", entries: list_()});
  return json_({status: "ok", message: "Koneksi aktif!"});
}

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    return json_(upsert_(data.entries || []));
  } catch (err) {
    return json_({status: "error", message: String(err)});
  }
}

function upsert_(entries) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = getSheet_();
    var last = sh.getLastRow();
    var existing = {};
    if (last > 1) {
      sh.getRange(2, 1, last - 1, 8).getValues().forEach(function (r, i) {
        if (r[0] !== "") existing[String(r[0])] = {row: i + 2, vals: r.map(str_)};
      });
    }
    var fresh = [], updated = 0;
    entries.forEach(function (r) {
      var row = [String(r.id), String(r.date), r.title || "", r.body || "", r.categories || "",
                 Number(r.productivity) || "", r.mood || "", r.updatedAt || r.createdAt || ""];
      var hit = existing[String(r.id)];
      if (hit) {
        if (hit.vals.join("|") !== row.map(str_).join("|")) {
          sh.getRange(hit.row, 1, 1, 8).setValues([row]);
          updated++;
        }
      } else {
        fresh.push(row);
        existing[String(r.id)] = {row: -1, vals: row.map(str_)};
      }
    });
    if (fresh.length) {
      var start = sh.getLastRow() + 1;
      var rng = sh.getRange(start, 1, fresh.length, 8);
      sh.getRange(start, 1, fresh.length, 2).setNumberFormat("@");
      sh.getRange(start, 8, fresh.length, 1).setNumberFormat("@");
      rng.setValues(fresh);
    }
    return {status: "ok", added: fresh.length, updated: updated};
  } finally {
    lock.releaseLock();
  }
}

function list_() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, 8).getValues();
  var out = [], idsChanged = false;
  vals.forEach(function (r, i) {
    if (!r[2] && !r[3]) return;
    var id = str_(r[0]);
    if (!id) { id = "s" + Date.now() + "_" + (i + 2); vals[i][0] = id; idsChanged = true; }
    out.push({id: id, date: str_(r[1]), title: str_(r[2]), body: str_(r[3]), categories: str_(r[4]),
              productivity: Number(r[5]) || 3, mood: str_(r[6]),
              createdAt: (r[7] instanceof Date) ? r[7].toISOString() : str_(r[7])});
  });
  if (idsChanged) {
    sh.getRange(2, 1, vals.length, 1).setNumberFormat("@")
      .setValues(vals.map(function (r) { return [r[0]]; }));
  }
  return out;
}
