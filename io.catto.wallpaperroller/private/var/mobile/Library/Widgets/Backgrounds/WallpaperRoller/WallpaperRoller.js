var nextUpdate;

// Failsafes for cases where Xen decides to ignore default options :/
var interval = typeof interval === 'undefined' ? 15 : interval;
var sensitivity = !(parseInt(sensitivity) > 0) ? 40 : parseInt(sensitivity);
var fadeEnable = typeof fadeEnable === 'undefined' ? false : fadeEnable;
var fadeSpeed = !(parseInt(fadeSpeed) > 0) ? 20 : parseInt(fadeSpeed);
var fadeDelay = !(parseInt(fadeDelay) > 0) ? 300 : parseInt(fadeDelay);
var useOnline = typeof useOnline === 'undefined' ? false : useOnline;
var checkURL = typeof checkURL === 'undefined' ? '' : checkURL;
var remoteURL = typeof remoteURL === 'undefined' ? 'https://cors-anywhere.herokuapp.com/e621.net/posts.json?tags=id:1229885&limit=1' : remoteURL;
var blacklist = typeof blacklist === 'undefined' ? '' : blacklist;

var preventDoubleChange = false; // used for shaking compensation
var elToUpdate = "bg2" // Determines which image to update next as we load 2 images at once

var x1 = 0,
  y1 = 0,
  z1 = 0,
  x2 = 0,
  y2 = 0,
  z2 = 0;

window.onload = function () {
  // Yes, this will ignore the online only mode on first launch
  // Xen HTML really likes to reload widgets in its settings,
  // so we avoid getting rate limited when user is configuring it
  this.changeLocalWallpaper(true);
  nextUpdate = addMinutes(new this.Date(), interval);
};

window.onresume = function () {
  if (new this.Date() > nextUpdate) {
    this.changeAutoWallpaper(false);
    nextUpdate = addMinutes(new this.Date(), interval);
  }
};

// Shake the device to change wallpaper
window.addEventListener(
  'devicemotion',
  function (e) {
    x1 = e.accelerationIncludingGravity.x;
    y1 = e.accelerationIncludingGravity.y;
    z1 = e.accelerationIncludingGravity.z;
  },
  false
);

setInterval(function () {
  var change = Math.abs(x1 - x2 + y1 - y2 + z1 - z2);

  if (change > sensitivity) {
    if (preventDoubleChange) {
      preventDoubleChange = false;
    } else {
      changeAutoWallpaper(true);
      preventDoubleChange = true;
    }
  }

  // Update new position
  x2 = x1;
  y2 = y1;
  z2 = z1;
}, 250);

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function connectWebSocket(url, timeout) {
  timeout = timeout || 250;
  return new Promise(function (resolve, reject) {
    // Create WebSocket connection.
    const socket = new WebSocket(url);

    const timer = setTimeout(function () {
      reject(new Error('timeOut'));
      done();
      socket.close();
    }, timeout);

    function done() {
      // cleanup all state here
      clearTimeout(timer);
      socket.removeEventListener('error', error);
    }

    function error(e) {
      reject(e);
      done();
    }

    socket.addEventListener('open', function () {
      resolve(socket);
      done();
    });
    socket.addEventListener('error', error);
  });
}

// https://stackoverflow.com/questions/6121203/how-to-do-fade-in-and-fade-out-with-javascript-and-css
function fadeIn(from, to, speed, callback, bothSlots) {
  // TODO: find a better way to implement this
  if (!fadeEnable) speed = 0

  // TODO: this breaks when called during fading
  const fromEl = document.getElementById(from);
  const toEl = document.getElementById(to);
  toEl.style.zIndex = 10;
  fromEl.style.zIndex = 0;
  if (speed === 0) {
    toEl.style.opacity = 1;
    toEl.style.display = 'initial';
    fromEl.style.opacity = 0;
    fromEl.style.display = 'none';
    callback(bothSlots);
    return true;
  }

  let opacity = 0.1;  // initial opacity
  toEl.style.display = 'initial';
  let timer = setInterval(function () {
      if (opacity >= 1){
          fromEl.style.display = 'none';
          fromEl.style.opacity = 0;
          clearInterval(timer);
      }
      toEl.style.opacity = opacity;
      toEl.style.filter = 'alpha(opacity=' + opacity * 100 + ")";
      opacity += opacity * 0.1;
  }, speed);

  callback(bothSlots);
  return true;
}

// TODO: mmm, callback spaghetti
function changeAutoWallpaper(bothSlots) {
  if (!bothSlots) {
    flipFlop(changeAutoWallpaperCB, bothSlots)
  } else changeAutoWallpaperCB()
}

// Function to change the wallpaper depending on current condition type
function changeAutoWallpaperCB(bothSlots) {
  if (!useOnline) {
    if (fadeEnable) {
      setTimeout(changeLocalWallpaper(bothSlots), fadeDelay);
    } else changeLocalWallpaper();
    return;
  }
  if (!checkURL) {
    if (fadeEnable) {
      setTimeout(changeOnlineWallpaper(bothSlots), fadeDelay);
    } else changeOnlineWallpaper();
    return;
  }

  // This checks if we're on WiFi or on cellular by connecting to a LAN HTTP server
  // like a router or any other device, and if we get a connection error 
  // (since it's websockets and not standard HTTP), we're on WiFi. Timeout: cellular
  try {
    connectWebSocket(`ws://{checkURL}`, 250).catch(function (err) {
      console.log(err);
      if (err == 'Error: timeOut') {
        if (fadeEnable) {
          setTimeout(changeLocalWallpaper(bothSlots), fadeDelay);
        } else changeLocalWallpaper(bothSlots);
      } else {
        if (fadeEnable) {
          setTimeout(changeOnlineWallpaper(bothSlots), fadeDelay);
        } else changeOnlineWallpaper(bothSlots);
      }
    });
  } catch (timeOut) {
    if (fadeEnable) {
      setTimeout(changeOnlineWallpaper(bothSlots), fadeDelay);
    } else changeOnlineWallpaper(bothSlots);
  }
}

// This is the online component, should be compatible with most modern Danbooru APIs
// Cors-anywhere can be used as XenHTML has no CORS proxy yet
function changeOnlineWallpaper(bothSlots) {
  const headers = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'WallpaperRoller/1.1 (+am@catto.io)',
  });

  fetch(remoteURL, {
    method: 'GET',
    mode: 'cors',
    headers: headers,
  })
    .then(function (response) {
      return response.json();
    })
    .then(function (posts) {
      const good_posts = posts['posts'].filter((post) => {
        const post_tags = Object.values(post['tags']).flat();
        return post_tags.every((tag) => {
          return !blacklist.split(',').includes(tag);
        });
      });

      if (bothSlots) {
        document.getElementById("bg").src =
        good_posts[Math.floor(Math.random() * good_posts.length)]['file'][
          'url'
        ];
        document.getElementById("bg2").src =
        good_posts[Math.floor(Math.random() * good_posts.length)]['file'][
          'url'
        ];
      } else {
      document.getElementById(elToUpdate).src =
        good_posts[Math.floor(Math.random() * good_posts.length)]['file'][
          'url'
        ];}
    });
}

function changeLocalWallpaper(bothSlots) {
  // This is where the image list will be generated upon WallpaperRoller (re)installation.
  // Put files into /var/mobile/Library/WR_Pictures
  const imageList = ["wr_welcome.jpg",]

  if (bothSlots) {
    const selectBG = imageList[Math.floor(Math.random() * imageList.length)];
    document.getElementById("bg").src = 'images/' + selectBG;
    const selectBG2 = imageList[Math.floor(Math.random() * imageList.length)];
    document.getElementById("bg2").src = 'images/' + selectBG2;
  } else {
    const selectBG = imageList[Math.floor(Math.random() * imageList.length)];
    document.getElementById(elToUpdate).src = 'images/' + selectBG;
  }
}

// Switch the current image element to the hidden, pre-loaded next image
function flipFlop(callback, bothSlots, speed = fadeSpeed) {
  if (parseFloat(document.getElementById('bg2').style.opacity) === 0) {
    const img = document.getElementById('bg2')

    if (img.complete) {
      fadeIn(from='bg', to='bg2', speed, callback, bothSlots)
    } else {
      img.addEventListener('load', fadeIn(from='bg', to='bg2', speed))
      img.addEventListener('error', function() {
        console.error('error loading image')
      })
    }
    elToUpdate = "bg"
  } else {
    const img = document.getElementById('bg')

    if (img.complete) {
      fadeIn(from='bg2', to='bg', speed, callback, bothSlots)
    } else {
      img.addEventListener('load', fadeIn(from='bg2', to='bg', speed))
      img.addEventListener('error', function() {
        console.error('error loading image')
      })
    }
    elToUpdate = "bg2"
  }
  
  return elToUpdate
}
