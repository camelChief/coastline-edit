const gm = google.maps;

let map;
let polyDraw;
let lineInfo;
let downloadLink;
let importLink;
let shiftKeyDown = false;

const tools = {
  _selected: "drag",
  get selected() { return this._selected; },
  
  set selected(newId) {
    if (this._selected == newId) return;
    if (newId != "drag" && lines.count == 0) return;
    if (newId == "poly") return;
    
    // visually toggle tool
    const oldTool = document.getElementById(this._selected);
    const newTool = document.getElementById(newId);
    oldTool.setAttribute("data-selected", "false");
    newTool.setAttribute("data-selected", "true");

    // reset old tool requirements
    switch(this._selected) {
      case "edit":
        saveEdits();
      case "pick":
      case "snip":
        lines.selected = [];
        for (let line of lines.drawn) {
          line.setOptions({
            strokeOpacity: 1,
            clickable: false,
          });
        }
    }

    // set up new tool requirements
    switch(newId) {
      case "edit":
      case "pick":
      case "snip":
        for (let line of lines.drawn) {
          line.setOptions({
            strokeOpacity: 0.5,
            clickable: true,
          });
        }
    }
    
    this._selected = newId;
  }
};

const lines = {
  _data: {},
  _drawn: [],
  _hovered: null,
  _selected: [],
  _points: [],
  _count: 0,
  
  get data() { return this._data; },
  get drawn() { return this._drawn; },
  get selected() { return this._selected; },
  get count() { return this._count; },
  
  set data(newData) {    
    for (let line of this._drawn)
      line.setMap(null);
    this._drawn = [];
    
    for (let id in newData) {
      let color;
      switch (newData[id].grade) {
        case 5:
          color = "#FE4A49";
          break;
        case 4:
          color = "#FFBA08";
          break;
        case 3:
          color = "#55D6BE";
          break;
        default:
          color = "#BE123C";
      }
      
      const line = new gm.Polyline({
        map: map,
        path: newData[id].coords,
        geodesic: true,
        strokeColor: color,
        strokeOpacity: tools.selected == "drag" ? 1 : 0.5,
        strokeWeight: 4,
        clickable: tools.selected != "drag",
        id: id,
      });
      
      gm.event.addListener(line, "mouseover", mouseoverLineHandler(line));
      gm.event.addListener(line, "mouseout", mouseoutLineHandler);
      gm.event.addListener(line, "click", clickLineHandler(line));
      this._drawn.push(line);
    }
    
    const needUpdate = ["pick", "snip", "edit"]; // "poly"
    for (let toolId of needUpdate) {
      const tool = document.getElementById(toolId);
      if (Object.keys(newData).length == 0) {
        tool.classList.remove("hover:bg-slate-300", "text-slate-800");
        tool.classList.add("text-slate-300", "cursor-default");
      } else {
        tool.classList.remove("text-slate-300", "cursor-default");
        tool.classList.add("hover:bg-slate-300", "text-slate-800");
      }
    }
    
    this._count = Object.keys(newData).length;
    this._data = newData;
  },
  
  set hovered(newHovered) {
    if (this._selected.includes(newHovered)) return;
    
    if (newHovered == null) {
      if (this._hovered == null) return;
      this._hovered.setOptions({
        strokeOpacity: 0.5,
        strokeWeight: 4,
      });
      for (let point of this._points)
        point.setMap(null);
      this._points = [];
    } else {
      newHovered.setOptions({
        strokeOpacity: 1,
        strokeWeight: 12,
      });
      const path = newHovered.getPath().getArray();
      const endPoints = [0, path.length - 1];
      for (let index of endPoints)
        this._points.push(new gm.Marker({
          map: map,
          position: path[index],
          icon: {
            path: gm.SymbolPath.CIRCLE,
            scale: 2,
            strokeOpacity: 0,
            fillColor: "white",
            fillOpacity: 1,
          },
        }));
    }
    
    this._hovered = newHovered;
  },
  
  set selected(newSelection) {
    this.hovered = null;
    for (let line of this._selected)
      line.setOptions({strokeOpacity: 0.5});
    
    const needUpdate = ["join", "delete", "tag5", "tag4", "tag3"];
    if (newSelection.length == 0) {      
      for (let toolId of needUpdate) {
        const tool = document.getElementById(toolId);
        tool.classList.remove("hover:bg-slate-300", "text-slate-800");
        tool.classList.add("text-slate-300", "cursor-default");
      }
    } else {
      for (let line of newSelection)
        line.setOptions({strokeOpacity: 1});
      for (let point of this._points)
        point.setMap(null);
      this._points = [];
      
      for (let toolId of needUpdate) {
        const tool = document.getElementById(toolId);
        tool.classList.remove("text-slate-300", "cursor-default");
        tool.classList.add("hover:bg-slate-300", "text-slate-800");
      }
    }
    
    this._selected = newSelection;
  }
};

function init() {
  map = new gm.Map(
    document.getElementById("map"), 
    {
      center: {lat: -33.8688, lng: 151.2093},
      mapTypeId: gm.MapTypeId.SATELLITE,
      // mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: false,
      zoom: 12,
    },
  );
  
  polyDraw = new gm.drawing.DrawingManager({
    drawingMode: google.maps.drawing.OverlayType.POLYGON,
    drawingControl: false,
    polygonOptions: {
      fillColor: "white",
      fillOpacity: 0.1,
      strokeColor: "white",
      strokeWeight: 2,
    },
  });
  
  downloadLink = document.createElement("a");
  importLink = document.createElement("input");
  importLink.type = "file";
  importLink.accept = ".json";
  
  document.addEventListener("keydown", keydownHandler);
  document.addEventListener("keyup", keyupHandler);
  gm.event.addListener(map, "click", clickMapHandler);
  gm.event.addListener(polyDraw, "polygoncomplete", completePolygonHandler);
  importLink.onchange = clickImportHandler;
}

function keydownHandler(e) {
  switch (e.key) {
    case "d":
      tools.selected = "drag";
      break;
    case "s":
      tools.selected = "pick";
      break;
    case "c":
      tools.selected = "snip";
      break;
    case "e":
      tools.selected = "edit";
      break;
    case "j":
      joinLines();
      break;
    case "x":
      deleteLines();
      break;
    case "3":
      tagLines(3);
      break;
    case "4":
      tagLines(4);
      break;
    case "5":
      tagLines(5);
      break;
    case "Shift":
      shiftKeyDown = true;
      break;
    case "Escape":
      tools.selected = "drag";
      break;
    case "Delete":
      deleteLines();
      break;
  }
}

function keyupHandler(e) {
  if (e.key == "Shift") {
    shiftKeyDown = false;
  }
}

function clickMapHandler(e) {
  console.log("map clicked");
  if (tools.selected == "edit") {
    tools.selected = "drag";
    return;
  }
  
  if (lines.selected.length > 0 && !shiftKeyDown)
    lines.selected = [];
}

function completePolygonHandler(e) {
  // grab all lines that fall within the polygon
  tools.selected = "pick";
}

function clickImportHandler(e) {
  const reader = new FileReader();
  reader.onload = (f) => {
    lines.data = {...lines.data, ...JSON.parse(f.target.result)};
    displayAlert("success", "Line data imported.");
  };
  reader.readAsText(e.target.files[0]);
}

function mouseoverLineHandler(line) {
  return function(e) {
    lines.hovered = line;
    const id = line.get("id");
    lineInfo = displayAlert("info", `Line: ${id}`);
  }
}

function mouseoutLineHandler(e) {
  lines.hovered = null;
  lineInfo.remove();
}

function clickLineHandler(line) {
  return function(e) {
    if (tools.selected == "snip") {
      const path = line.getPath().getArray();
      let shortestDist = Number.POSITIVE_INFINITY;
      let closestIndex = 0;
      for (let i = 0; i < path.length; i++) {
        const geom = gm.geometry.spherical;
        const distance = geom.computeDistanceBetween(e.latLng, path[i]);
        if (distance > shortestDist) continue;
        
        shortestDist = distance;
        closestIndex = i;
      }
      
      const pathA = path.slice(0, closestIndex + 1);
      const pathB = path.slice(closestIndex);
      
      const data = lines.data;
      const id = line.get("id");
      const grade = data[id].grade;
      delete data[id];
      
      data[`${id}a`] = {coords: pathA, grade: grade};
      data[`${id}b`] = {coords: pathB, grade: grade};
      lines.data = data;
      tools.selected = "pick";
    } else if (tools.selected == "edit") {
      if (lines.selected.length == 1) {
        tools.selected = "drag";
        return;
      }
      lines.selected = [line];
      line.setEditable(true);
      return;
    }
    
    if (!shiftKeyDown) return lines.selected = [line];

    if (lines.selected.includes(line)) {
      const index = lines.selected.indexOf(line);
      lines.selected = lines.selected.toSpliced(index, 1);
    } else lines.selected = [...lines.selected, line];
  }
}


function saveEdits() {
  if (lines.selected.length == 0) return;
  const line = lines.selected[0];
  line.setEditable(false);
  const id = line.get("id");
  const path = line.getPath().getArray();
  const data = lines.data;
  data[id].coords = path;
  lines.data = data;
  lines.selected = [];
}

function joinLines() {
  if (lines.selected.length < 2)
    return displayAlert("warning", "Select at least 2 lines.");
  
  let newId;
  let newGrade
  let newPath;
  
  for (let i = 0; i < lines.selected.length; i++) {
    const line = lines.selected[i];
    const id = line.get("id");
    const grade = lines.data[id].grade;
    const path = lines.data[id].coords;
    
    if (i == 0) {
      newId = id;
      newGrade = grade;
      newPath = [...path];
      continue;
    }
    
    const ps = path[0];
    const pe = path[path.length - 1];
    const nps = newPath[0];
    const npe = newPath[newPath.length - 1];
    
    const geom = gm.geometry.spherical;
    const s2e = geom.computeDistanceBetween(ps, npe);
    const e2s = geom.computeDistanceBetween(pe, nps);
    const s2s = geom.computeDistanceBetween(ps, nps);
    const e2e = geom.computeDistanceBetween(pe, npe);
    
    if (s2e < 2)
      newPath = newPath.concat(path.slice(1));
    else if (e2s < 2)
      newPath = path.concat(newPath.slice(1));
    else if (s2s < 2)
      newPath = path.reverse().concat(newPath.slice(1));
    else if (e2e < 2)
      newPath = newPath.concat(path.reverse().slice(1));
    else return displayAlert("error", "Lines aren't contiguous.");
  }
  
  const data = lines.data;
  for (let line of lines.selected) {
    const id = line.get("id");
    delete data[id];
  }
  data[newId] = {coords: newPath, grade: newGrade};
  lines.data = data;
}

function deleteLines() {
  const data = lines.data;
  for (let line of lines.selected) {
    const id = line.get("id");
    delete data[id];
  }
  lines.data = data;
}

function tagLines(grade) {
  const data = lines.data;
  for (let line of lines.selected) {
    const id = line.get("id");
    data[id].grade = grade;
  }
  lines.data = data;
}

function importData() {
  importLink.click();
}

function downloadData() {
  tools.selected = "drag";
  const json = JSON.stringify(lines.data);
  const url = URL.createObjectURL(new Blob([json], {type: 'application/json'}));
  const title = prompt("Name your file:");
  if (title == null) return URL.revokeObjectURL(url);
  
  downloadLink.href = url;
  downloadLink.download = `${title}.json`;
  downloadLink.click();
  
  URL.revokeObjectURL(url);
  downloadLink.remove();
  
  displayAlert("success", "Line data downloaded.");
}

function clearData() {
  lines.data = [];
  tools.selected = "drag";
  displayAlert("warning", "Line data cleared.");
}

function displayAlert(type, text) {
  let icon;
  let color;
  
  // define the icon and color based on the type of alert
  switch (type) {
    case "info":
      icon = "info";
      color = "slate";
      break;
    case "success":
      icon = "check_circle";
      color = "green";
      break;
    case "error":
      icon = "cancel";
      color = "red";
      break;
    case "warning":
      icon = "warning";
      color = "yellow";
      break;
    default:
      throw new TypeError("Invalid alert type. Expected 'info', 'success', 'error' or 'warning'.");
  }
  
  // create all the elements for the alert
  const alert = document.createElement("div");
  const alertIcon = document.createElement("span");
  const alertText = document.createElement("span");
  const alertSpacer = document.createElement("div");
  const alertAction = document.createElement("button");
  
  // piece the alert together
  alert.appendChild(alertIcon);
  alert.appendChild(alertText);
  alert.appendChild(alertSpacer);
  alert.appendChild(alertAction);
  
  // stylise the alert
  alert.setAttribute("class", `bg-slate-100 text-${color}-700 rounded p-4 flex gap-x-4`);
  alertIcon.innerHTML = icon;
  alertIcon.setAttribute("class", "material-symbols-rounded");
  alertText.innerHTML = text;
  alertSpacer.setAttribute("class", "w-16 grow");
  alertAction.innerHTML = "close";
  alertAction.setAttribute("onclick", "this.parentNode.remove()");
  alertAction.setAttribute("class", "hover:bg-slate-200 rounded transition-all duration-200 material-symbols-rounded");
  
  // display the alert
  const alertList = document.getElementById("alerts");
  alertList.appendChild(alert);
  
  // wait and then hide the alert
  setTimeout(() => alert.remove(), 5000);
  return alert;
}