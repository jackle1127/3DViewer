// shaders variable has to be loaded by the php file.
var VERTEX_SHADER = shaders['vertex'];
var FRAGMENT_SHADER = shaders['fragment'];
var VERTEX_CUBE_SHADER = shaders['vertexcube'];
var FRAGMENT_CUBE_SHADER = shaders['fragmentcube'];
var VERTEX_IMAGE = shaders['verteximage'];
var FRAGMENT_THRESHOLD = shaders['fragmentthreshold'];
var FRAGMENT_BLUR_HORIZONTAL = shaders['fragmentblurhorizontal'];
var FRAGMENT_BLUR_VERTICAL = shaders['fragmentblurvertical'];
var FRAGMENT_ADD = shaders['fragmentadd'];

function Viewer(canvas) {
    function createShaderProgram(gl, vertexCode, fragmentCode, name) {
        var newShaderProgram = gl.createProgram();
        var vertexShader = getShader(gl, vertexCode, "VERTEX", name);
        var fragmentShader = getShader(gl, fragmentCode, "FRAGMENT", name);
        gl.attachShader(newShaderProgram, vertexShader);
        gl.attachShader(newShaderProgram, fragmentShader);
        gl.linkProgram(newShaderProgram);

        if (!gl.getProgramParameter(newShaderProgram, gl.LINK_STATUS)) {
            alert("Can't link " + name + " shader program to gl context. " + gl.getProgramInfoLog(newShaderProgram));
        }
        
        return newShaderProgram;
    }
    
    this.canvas = canvas;
    this.gl = null;
    try {
        this.gl = canvas.getContext("experimental-webgl");
    } catch(e) {
        return;
    }
    this.meshes = [];
    
    // Camera transformations.
    // The current attributes will follow their targets exponentially by the transformAlpha.
    this.transformAlpha = .2;
    this.distanceMin = 1;
    this.distanceMax = 20;
    this.distanceDelta = 1.2; // This is more of a multiplier when scroll in and out.
    this.distanceTarget = this.distance = 6;
    this.pitchMax = 85;
    this.targetPitch = this.pitch = 10;
    this.targetYaw = this.yaw = 0;
    this.xRotateSpeed = 1;
    this.yRotateSpeed = 1;
    this.xMovementSpeed = 1;
    this.yMovementSpeed = 1;
    this.offset = $V([0, 0, 0]);
    this.offsetTarget = $V([0, 0, 0]);

    this.mvMatrix = Matrix.I(4);
    this.refreshRightUpVectors();
    this.ambient = [1, 1, 1, 1];
    this.backgroundIntensity = 1;
    this.directionalLights = []; // Maximum of 6 directional lights.
    var light = new DirectionalLight();
    light.setDirection([0, -1, -1]);
    light.color = [.4, .4, .4, 1];
    this.directionalLights.push(light);
    this.backgroundLOD = 0; // To blur it.
    
    this.shaderProgram = createShaderProgram(this.gl, VERTEX_SHADER, FRAGMENT_SHADER, 'Geometry');
    this.shaderProgramCube = createShaderProgram(this.gl, VERTEX_CUBE_SHADER, FRAGMENT_CUBE_SHADER, 'Cubemap');
    this.shaderProgramThreshold = createShaderProgram(this.gl, VERTEX_IMAGE, FRAGMENT_THRESHOLD, 'Threshold');
    this.shaderProgramBlurHorizontal = createShaderProgram(this.gl, VERTEX_IMAGE, FRAGMENT_BLUR_HORIZONTAL, 'Blur');
    this.shaderProgramBlurVertical = createShaderProgram(this.gl, VERTEX_IMAGE, FRAGMENT_BLUR_VERTICAL, 'Blur');
    this.shaderProgramAdd = createShaderProgram(this.gl, VERTEX_IMAGE, FRAGMENT_ADD, 'Add');

    this.positionAttribute = this.gl.getAttribLocation(this.shaderProgram, "aPosition");
    this.normalAttribute = this.gl.getAttribLocation(this.shaderProgram, "aNormal");
    this.tangentAttribute = this.gl.getAttribLocation(this.shaderProgram, "aTangent");
    this.uvAttribute = this.gl.getAttribLocation(this.shaderProgram, "aUV");

    this.projectedPosAttribute = this.gl.getAttribLocation(this.shaderProgramCube, "aProjectedPos");
    this.projectedPosBuffer = this.gl.createBuffer();

    this.thresholdVertexAtt = this.gl.getAttribLocation(this.shaderProgramThreshold, "aVertexPos");
    this.blurHVertexAtt = this.gl.getAttribLocation(this.shaderProgramBlurHorizontal, "aVertexPos");
    this.blurVVertexAtt = this.gl.getAttribLocation(this.shaderProgramBlurVertical, "aVertexPos");
    this.addVertexAtt = this.gl.getAttribLocation(this.shaderProgramAdd, "aVertexPos");
    // For the image processing.
    this.imageVertexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.imageVertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER,
            new Float32Array(
                [-1, -1,    1, -1,
                 1, 1,      -1, 1]
            ), this.gl.STATIC_DRAW);
    
    this.mvMatrixStack = [];
    this.fov = 60;
    this.frameBuffer = Array(3);
    this.depthBuffer = Array(3);
    this.frameTexture = Array(3);
    this.resizeCanvas();
    
    this.gl.clearColor(this.ambient[0], this.ambient[1], this.ambient[2], this.ambient[3]);
    this.gl.clearDepth(1.0);
    this.gl.enable(this.gl.CULL_FACE);
    this.gl.cullFace(this.gl.BACK);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.interval = null;
    
    this.defaultDiffuse2D = createSinglePixelTexture(this.gl, [255, 255, 255, 255]);
    this.defaultOcclusion2D = createSinglePixelTexture(this.gl, [255, 255, 255, 255]);
    this.defaultNormal2D = createSinglePixelTexture(this.gl, [127, 127, 255, 255]);
    this.defaultSpecular2D = createSinglePixelTexture(this.gl, [255, 255, 255, 255]);
    this.defaultGloss2D = createSinglePixelTexture(this.gl, [255, 255, 255, 255]);
    this.defaultEmission2D = createSinglePixelTexture(this.gl, [255, 255, 255, 255]);
    this.skybox = createEmptyCubemap(this.gl, [127, 127, 127, 255]);
    
    this.prevTime = (new Date()).getTime();
    this.countFPS = false;
    this.bloomEnabled = true;
    this.bloomThreshold = .96;
    this.bloomBlurIterations = 1;
    // Multiplying bloomSize with texel size so there won't be a need to pass an extra parameter into the shader.
    this.bloomSize = 2.2;
    this.bloomIntesity = .3;
    this.bloomSoftRange = .04;
    
    this.updateCamera = function() {
        this.distance = lerpF(this.distance, this.distanceTarget, this.transformAlpha);
        this.pitch = lerpF(this.pitch, this.targetPitch, this.transformAlpha);
        this.yaw = lerpF(this.yaw, this.targetYaw, this.transformAlpha);
        this.offset = lerpV(this.offset, this.offsetTarget, this.transformAlpha);
    }
    
    var thisViewer = this;
    // Set camera control events for the canvas.
    // Disable contextmenu on right click.
    canvas.addEventListener('contextmenu', function (e) {e.preventDefault()}, false);
    this.mouseState = {'button' : 'none', 'prevX' : -1, 'prevY' : -1};
    canvas.onmousedown = function (e) {
        e.preventDefault();
        if (e.button === 0) {
            thisViewer.mouseState.button = 'left';
        } else if (e.button === 2) {
            thisViewer.mouseState.button = 'right';
        }
        thisViewer.mouseState.prevX = e.clientX;
        thisViewer.mouseState.prevY = e.clientY;
    };
    canvas.onmousemove = function (e) {
        //console.log(thisViewer.mouseState);
        if (thisViewer.mouseState.button !== 'none') {
            var deltaX = e.clientX - thisViewer.mouseState.prevX;
            var deltaY = e.clientY - thisViewer.mouseState.prevY;
            if (thisViewer.mouseState.button == 'left') {
                // Left and drag to rotate.
                thisViewer.targetYaw -= thisViewer.xRotateSpeed * deltaX;
                thisViewer.targetPitch += thisViewer.yRotateSpeed * deltaY;
                thisViewer.targetPitch = Math.max(-thisViewer.pitchMax, Math.min(thisViewer.pitchMax, thisViewer.targetPitch));
            } else if (thisViewer.mouseState.button == 'right') {
                // Right and drag to move offset.
                var multiplier = Math.tan((Math.PI / 180) * thisViewer.fov / 2)
                        * thisViewer.distance * 2 / thisViewer.height;
                thisViewer.offsetTarget = thisViewer.offsetTarget.add(thisViewer.rightVector.multiply(-thisViewer.xMovementSpeed * multiplier * deltaX));
                thisViewer.offsetTarget = thisViewer.offsetTarget.add(thisViewer.upVector.multiply(thisViewer.yMovementSpeed * multiplier * deltaY));
            }
            thisViewer.mouseState.prevX = e.clientX;
            thisViewer.mouseState.prevY = e.clientY;
        }
    };
    canvas.onmouseout = canvas.onmouseup = function (e) {
        e.preventDefault();
        thisViewer.mouseState.button = 'none';
    };
    // To cover all browsers mouse scroll events.
    var mouseScroll = function(e) {
        e.preventDefault();
        var delta = -e.wheelDelta || e.deltaY || e.detail;
        if (delta < 0) {
            thisViewer.distanceTarget /= thisViewer.distanceDelta;
        } else {
            thisViewer.distanceTarget *= thisViewer.distanceDelta;
        }
        thisViewer.distanceTarget = clamp(thisViewer.distanceTarget, thisViewer.distanceMin,
                thisViewer.distanceMax);
    };
    
    canvas.addEventListener('wheel', mouseScroll);
    canvas.addEventListener('mousewheel', mouseScroll);
    canvas.addEventListener('DOMMouseScroll', mouseScroll);
}

// Mesh stores vertex locations, uv, normals, tangents, transformation.
// Each mesh also stores a list of submeshes which store the triangles that has a unique material on.
function Mesh(viewer) {
    this.viewer = viewer;
    this.submeshes = [];
    this.transparentSubmeshes = [];
    this.position = $V([0, 0, 0]);
    this.rotation = [0, 0, 0];
    this.scale = $V([1, 1, 1]);
    viewer.meshes.push(this);
}

// Submesh keeps a reference of what mesh it belongs to.
// Each submesh has all the geometry of a material.
function Submesh(mesh) {
    this.mesh = mesh;
    this.diffuse = [1, 1, 1, 1];
    this.ambient = [1, 1, 1, 1];
    this.specular = [.3, .3, .3, 1];
    this.gloss = .5;
    this.emission = [0, 0, 0, 1];
    this.normalMultiplier = 1;
    this.diffuse2D = mesh.viewer.defaultDiffuse2D;
    this.occlusion2D = mesh.viewer.defaultOcclusion2D;
    this.normal2D = mesh.viewer.defaultNormal2D;
    this.specular2D = mesh.viewer.defaultSpecular2D;
    this.gloss2D = mesh.viewer.defaultGloss2D;
    this.emission2D = mesh.viewer.defaultEmission2D;
    this.faces = [];
    mesh.submeshes.push(this);
}

function Face() {
    this.positions = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    this.normals = [[0, 1, 0], [0, 1, 0], [0, 1, 0]];
    this.uvs = [[0, 0], [0, 0], [0, 0]];
}

function DirectionalLight() {
    this.direction = $V([0, 0, -1]);
    this.color = [0, 0, 0, 1];
    this.fixed = false;
}

Viewer.prototype.resizeCanvas = function() {
    this.width = this.canvas.offsetWidth;
    this.height = this.canvas.offsetHeight;
    // Because the size of the canvas is not the same as its CSS size
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    
    this.gl.viewport(0, 0, this.width, this.height);
    this.setPerspectiveMatrix(this.width, this.height, this.fov, .1, 100);
    
    // Create image processing buffers.
    // Need 3 frame buffers and textures.
    for (var i = 0; i < 3; i++) {
        if (this.frameBuffer[i]) {
            this.gl.deleteFramebuffer(this.frameBuffer[i]);
            this.gl.deleteRenderbuffer(this.depthBuffer[i]);
            this.gl.deleteTexture(this.frameTexture[i]);
        }
        this.frameBuffer[i] = this.gl.createFramebuffer();
        this.frameTexture[i] = createImageProcessingTexture(this.gl, this.width, this.height);
        //this.frameTexture1 = createImageProcessingTexture(this.gl, 512, 512);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.frameBuffer[i]);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0,
                this.gl.TEXTURE_2D, this.frameTexture[i], 0);
        this.depthBuffer[i] = this.gl.createRenderbuffer();
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.depthBuffer[i]);
        this.gl.renderbufferStorage(this.gl.RENDERBUFFER, 
                this.gl.DEPTH_COMPONENT16, this.width, this.height);
        this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT,
                this.gl.RENDERBUFFER, this.depthBuffer[i]);
    }
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, null);
}

Viewer.prototype.setPerspectiveMatrix = function() {
    this.perspectiveMatrix = makePerspective(this.fov, this.width / this.height, .1, 100);
    this.texelSize = [1 / this.width, 1 / this.height];
    
    var vertical = Math.tan(this.fov / 2 * Math.PI / 180);
    var horizontal = vertical * this.width / this.height;
    // To divide the projected position by and get -1 to 1 clipspace coordinate.
    this.screenDivisor = [horizontal, vertical];
    this.projectedPos = [-horizontal, -vertical, 
            horizontal, -vertical,
            horizontal, vertical,
            -horizontal, vertical];
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.projectedPosBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER,
            new Float32Array(this.projectedPos), this.gl.STATIC_DRAW);
}

Viewer.prototype.drawScene = function() {
    
    function applyRotation(viewer) {
        rotateMatrix(viewer.mvMatrix, viewer.pitch, [1, 0, 0]);
        rotateMatrix(viewer.mvMatrix, -viewer.yaw, [0, 1, 0]);
    }

    if (this.bloomEnabled) {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.frameBuffer[0]);
    }
    
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    this.mvMatrix = Matrix.I(4);
    translateMatrix(this.mvMatrix, $V([0, 0, -this.distance]));
    applyRotation(this);
    translateMatrix(this.mvMatrix, this.offset.multiply(-1));

    var VMMatrix = this.mvMatrix.inverse();

    // Draw the cubemap.
    this.gl.useProgram(this.shaderProgramCube);
    this.gl.enableVertexAttribArray(this.projectedPosAttribute);
    
    this.gl.activeTexture(this.gl.TEXTURE11);
    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.skybox);
    this.gl.uniform1i(this.gl.getUniformLocation(this.shaderProgramCube, "uSkybox"), 11);
    this.gl.uniform1f(this.gl.getUniformLocation(this.shaderProgramCube, "uBackgroundLOD"), this.backgroundLOD);
    
    this.gl.uniform2fv(this.gl.getUniformLocation(this.shaderProgramCube, "uDivisor"), this.screenDivisor);
    this.gl.uniform1f(this.gl.getUniformLocation(this.shaderProgramCube, "uBackgroundIntensity"), this.backgroundIntensity);
    this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.shaderProgramCube, "uVMMatrix")
            , false, VMMatrix.flatten());
    
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.projectedPosBuffer);
    this.gl.vertexAttribPointer(this.projectedPosAttribute, 2, this.gl.FLOAT, false, 0, 0);
    
    this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, 4);

    // Draw 3D geometry
    this.gl.useProgram(this.shaderProgram);
    this.gl.enableVertexAttribArray(this.positionAttribute);
    this.gl.enableVertexAttribArray(this.normalAttribute);
    this.gl.enableVertexAttribArray(this.tangentAttribute);
    this.gl.enableVertexAttribArray(this.uvAttribute);

    this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.shaderProgram, "uVMMatrix")
            , false, VMMatrix.flatten());

    this.refreshRightUpVectors();
    this.gl.uniform4fv(this.gl.getUniformLocation(this.shaderProgram, "uEnvironmentAmbient"), this.ambient);

    var lightDirArray = [];
    var lightColorArray = [];
    var thisMVMatrix = this.mvMatrix;
    for (var i = 0; i < 6; i++) {
        if (i < this.directionalLights.length) {
            var light = this.directionalLights[i];
            lightColorArray = lightColorArray.concat(light.color);
            if (light.fixed) {
                lightDirArray = lightDirArray.concat(thisMVMatrix.multVector(light.direction, false).normalize().flatten());
            } else {
                lightDirArray = lightDirArray.concat(light.direction.normalize().flatten());
            }
        } else {
            lightDirArray.concat([0, 0, -1]); // To prevent 0, 0, 0 light direction.
        }
    }
    
    this.gl.uniform4fv(this.gl.getUniformLocation(this.shaderProgram,
            "uLightColors"), lightColorArray);
    this.gl.uniform3fv(this.gl.getUniformLocation(this.shaderProgram,
            "uLightDirections"), lightDirArray);
    this.gl.uniform1i(this.gl.getUniformLocation(this.shaderProgram,
            "uNumOfLights"), this.directionalLights.length);
    
    this.gl.activeTexture(this.gl.TEXTURE10);
    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.skybox);
    this.gl.uniform1i(this.gl.getUniformLocation(this.shaderProgram, "uSkybox"), 10);

    this.meshes.forEach(function(mesh) {
        mesh.draw();
    });
    
    if (this.bloomEnabled) {

        // Threshold.
        this.gl.useProgram(this.shaderProgramThreshold);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.frameBuffer[1]);
        this.gl.enableVertexAttribArray(this.projectedPosAttribute);

        this.gl.activeTexture(this.gl.TEXTURE11);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.frameTexture[0]);
        this.gl.uniform1i(this.gl.getUniformLocation(
                this.shaderProgramThreshold, 'uFrameBuffer'), 11);
        
        this.gl.uniform1f(this.gl.getUniformLocation(this.shaderProgramThreshold,
                "uThreshold"), this.bloomThreshold);
        this.gl.uniform1f(this.gl.getUniformLocation(this.shaderProgramThreshold,
                "uSoftRange"), this.bloomSoftRange);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.imageVertexBuffer);
        this.gl.vertexAttribPointer(this.thresholdVertexAtt, 2, this.gl.FLOAT, false, 0, 0);
        
        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, 4);
        
        // Blur.
        var swappingIndex = 1; // XOR this with 3 will make it oscillate between 1 and 2.
        var horizontalTexel = this.texelSize[0] * this.bloomSize;
        var verticalTexel = this.texelSize[1] * this.bloomSize;
        for (var i = 1; i <= this.bloomBlurIterations; i++) {
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,
                    this.frameBuffer[swappingIndex ^ 3]);
            this.gl.useProgram(this.shaderProgramBlurHorizontal);
            this.gl.enableVertexAttribArray(this.blurHVertexAtt);

            this.gl.activeTexture(this.gl.TEXTURE11);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.frameTexture[swappingIndex]);
            this.gl.uniform1i(this.gl.getUniformLocation(
                    this.shaderProgramBlurHorizontal, 'uFrameBuffer'), 11);
            
            this.gl.uniform1f(this.gl.getUniformLocation(this.shaderProgramBlurHorizontal,
                    "uTexelSize"), horizontalTexel);
            
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.imageVertexBuffer);
            this.gl.vertexAttribPointer(this.blurHVertexAtt, 2, this.gl.FLOAT, false, 0, 0);
            
            this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, 4);
            swappingIndex ^= 3;

            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,
                    this.frameBuffer[swappingIndex ^ 3]);
            this.gl.useProgram(this.shaderProgramBlurVertical);
            this.gl.enableVertexAttribArray(this.blurVVertexAtt);
            
            this.gl.activeTexture(this.gl.TEXTURE11);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.frameTexture[swappingIndex]);
            this.gl.uniform1i(this.gl.getUniformLocation(
                    this.shaderProgramBlurVertical, 'uFrameBuffer'), 11);
            
            this.gl.uniform1f(this.gl.getUniformLocation(this.shaderProgramBlurVertical,
                    "uTexelSize"), verticalTexel);
            
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.imageVertexBuffer);
            this.gl.vertexAttribPointer(this.blurVVertexAtt, 2, this.gl.FLOAT, false, 0, 0);
            
            this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, 4);
            swappingIndex ^= 3;
        }

        // Add.
        this.gl.useProgram(this.shaderProgramAdd);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        
        this.gl.activeTexture(this.gl.TEXTURE11);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.frameTexture[0]);
        this.gl.uniform1i(this.gl.getUniformLocation(
                this.shaderProgramAdd, 'uFrame1'), 11);
        
        this.gl.activeTexture(this.gl.TEXTURE12);
        // Blurred bloom is always on the second buffer
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.frameTexture[1]);
        this.gl.uniform1i(this.gl.getUniformLocation(
                this.shaderProgramAdd, 'uFrame2'), 12);
        
        this.gl.uniform1f(this.gl.getUniformLocation(this.shaderProgramAdd,
                "uFrame2Strength"), this.bloomIntesity);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.imageVertexBuffer);
        this.gl.vertexAttribPointer(this.addVertexAtt, 2, this.gl.FLOAT, false, 0, 0);
        
        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, 4);
    }
    
    if (this.countFPS) {
        var currentTime = (new Date).getTime();
        this.fps = 1000 / (currentTime - this.prevTime);
        this.prevTime = currentTime;
    }
}

Viewer.prototype.start = function(interval) {
    if (this.interval == null) {
        var thisViewer = this;
        this.interval = setInterval(function() {
            thisViewer.drawScene();
            thisViewer.updateCamera();
            if (thisViewer.update != null) thisViewer.update();
        }, interval);
    }
}

Viewer.prototype.stop = function() {
    if (this.interval !== null) {
        clearInterval(this.interval);
        this.interval = null;
    }
}

// Only call this when the mvMatrix is at the world space origin or weird things are going to happen.
Viewer.prototype.refreshRightUpVectors = function() {
    var tempMatrix = this.mvMatrix.dup();
    tempMatrix.ensure4x4();
    this.rightVector = $V(tempMatrix.elements[0].splice(0, 3));
    this.upVector = $V(tempMatrix.elements[1].splice(0, 3));
}

// Takes in image paths for the skybox.
// Skybox is a cubemap.
Viewer.prototype.loadSkybox = function(front, back, left, right, top, bottom) {
    var DISTRIBUTION_TEXTURE_SIZE = 512;
    
    // Create a m x 1 texture to sample the weight went generating environment maps.
    // Func is the distribution function.
    function createDistributionTexture(func, size, gl) {
        var newTexture = gl.createTexture();
        var pixels = [];
        for (var i = 0; i < size; i++) {
            var val = func(i / (size - 1));
            pixels.push(val);
        }
        gl.bindTexture(gl.TEXTURE_2D, newTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, size, 1, 0, gl.ALPHA, gl.FLOAT,
                new Float32Array(pixels));
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
    var posX = new Image();
    var negX = new Image();
    var posY = new Image();
    var negY = new Image();
    var posZ = new Image();
    var negZ = new Image();
    
    var count = 0;
    var thisViewer = this;
    var callback = function() {
        // Wait for all 6 to load.
        count ++;
        if (count < 6) return;
        
        thisViewer.stop(); // Stop drawing the scene to borrow the gl context for a bit.
        
        
        // To create the diffuse map.
        // alpha = 0 means center.
        var irradianceFunction = function(alpha) {
            return Math.cos(alpha * 1.5707963);
        };
        //var irradianceFilter = createDistributionTexture(
        
        thisViewer.skybox = createCubemap(thisViewer.gl, posX, negX, posY, negY, posZ, negZ);
        thisViewer.start();
    };
    
    posX.onload = callback;
    negX.onload = callback;
    posY.onload = callback;
    negY.onload = callback;
    posZ.onload = callback;
    negZ.onload = callback;
    
    posX.src = right;
    negX.src = left;
    posY.src = top;
    negY.src = bottom;
    posZ.src = front;
    negZ.src = back;
}


Mesh.prototype.processGeometry = function() {
    var thisViewer = this.viewer;
    function pushArrayElements(arrayToPush, elementArray) {
        elementArray.forEach(function(element) {
            arrayToPush.push(element);
        });
    }
    function createFloatBuffer(type, floatArray) {
        var newBuffer = thisViewer.gl.createBuffer();
        thisViewer.gl.bindBuffer(type, newBuffer);
        thisViewer.gl.bufferData(type, new Float32Array(floatArray), thisViewer.gl.STATIC_DRAW);
        return newBuffer;
    }
    function createIntBuffer(type, intArray) {
        var newBuffer = thisViewer.gl.createBuffer();
        thisViewer.gl.bindBuffer(type, newBuffer);
        thisViewer.gl.bufferData(type, new Uint16Array(intArray), thisViewer.gl.STATIC_DRAW);
        return newBuffer;
    }
    function swapElements(arr, index1, index2) {
        var temp = arr[index1];
        arr[index1] = arr[index2];
        arr[index2] = temp;
    }
    function removeElement(arr, element) {
        var spliceIndex = arr.indexOf(element);
        arr.splice(spliceIndex, 1);
    }
    // Map [x, y, z, Nx, Ny, Nz, Tx, Ty, Tz, u, v] to an index to optimize the mesh.
    //var vertexPropertyTable = {};
    var currentIndex = 0;
    var thisMesh = this;
    this.submeshes.forEach(function(submesh) {
        if (submesh.dissolve < 1.0) { // Move to transparentSubmeshes list.
            thisMesh.transparentSubmeshes.push(submesh);
        }
        //var indexArray = [];
        var positionArray = [];
        var normalArray = [];
        var tangentArray = [];
        var uvArray = [];
        submesh.numOfVertices = 0;
        submesh.faces.forEach(function(face) {
            // Calculate tangents
            var tangents = [[0, 1, 0], [0, 1, 0], [0, 1, 0]];
            // If they are distinct positions.
            if  (face.uvs[0] != face.uvs[1] + '' &&
                    face.uvs[1] != face.uvs[2] + '' &&
                    face.uvs[0] != face.uvs[2] + '') {
                var tempIndices = [0, 1, 2];
                // Sort the vertices from left to right.
                // Bubble sort but there are only 3 elements so....
                
                if (face.uvs[tempIndices[0]][0] > face.uvs[tempIndices[1]][0]) {
                    swapElements(tempIndices, 0, 1);
                }
                if (face.uvs[tempIndices[1]][0] > face.uvs[tempIndices[2]][0]) {
                    swapElements(tempIndices, 1, 2);
                }
                if (face.uvs[tempIndices[0]][0] > face.uvs[tempIndices[1]][0]) {
                    swapElements(tempIndices, 0, 1);
                }
                var uv12 = $V(face.uvs[tempIndices[1]]).subtract($V(face.uvs[tempIndices[0]]));
                var uv23 = $V(face.uvs[tempIndices[2]]).subtract($V(face.uvs[tempIndices[1]]));
                var uv13 = $V(face.uvs[tempIndices[2]]).subtract($V(face.uvs[tempIndices[0]]));
                var tangent = null;
                var MIN_X = .0001;
                if (Math.abs(uv12.elements[0]) < MIN_X) {
                    tangent = $V(face.positions[tempIndices[1]])
                            .subtract($V(face.positions[tempIndices[0]]))
                            .multiply(-uv12.elements[1] / Math.abs(uv12.elements[1]))
                            .normalize().flatten();

                } else if (Math.abs(uv23.elements[0]) < MIN_X) {
                    tangent = $V(face.positions[tempIndices[2]])
                            .subtract($V(face.positions[tempIndices[1]]))
                            .multiply(-uv23.elements[1] / Math.abs(uv23.elements[1]))
                            .normalize().flatten();
                } else if (Math.abs(uv13.elements[0]) < MIN_X) {
                    tangent = $V(face.positions[tempIndices[2]])
                            .subtract($V(face.positions[tempIndices[0]]))
                            .multiply(-uv13.elements[1] / Math.abs(uv13.elements[1]))
                            .normalize().flatten();
                } else {
                    // uv12.x + coef13 * uv13.x = 0.
                    // Therefore we have a vertical vector.
                    // The coef13 is then multiplied by the 3D v13 added to v12 gives us
                    // a vector vertical to the uv of the face.
                    // Dividing this vertical vector by the vertical component of
                    // uv12 + coef13 * uv13 gives up the "normalized" tangent in.
                    // We still need to normalize it in 3D space.
                    var coef13 = -uv12.elements[0] / uv13.elements[0];
                    var divisor = 1 / (uv12.elements[1] + coef13 * uv13.elements[1]);
                    // tangent = v12 + coef13 * v13.
                    //console.log(face.positions[tempIndices[1]]);
                    tangent = $V(face.positions[tempIndices[1]])
                            .subtract($V(face.positions[tempIndices[0]])) // v12
                            .add($V(face.positions[tempIndices[2]])
                            .subtract($V(face.positions[tempIndices[0]])) // v13
                            .multiply(coef13))
                            .multiply(-divisor) // Because possitive is downward.
                            .normalize().flatten();
                }
                if (tangent != null) {
                    tangents = [tangent, tangent, tangent];
                    if (tangent.length != 3) {
                        console.log(tangent);
                    }
                }
            }
            for (var i = 0; i <= 2; i++) {
                if (face.normals[i] == undefined) console.log(face, submesh);
                pushArrayElements(positionArray, face.positions[i]);
                pushArrayElements(normalArray, face.normals[i]);
                pushArrayElements(tangentArray, tangents[i]);
                pushArrayElements(uvArray, face.uvs[i]);
                vertexIndex = currentIndex;
                currentIndex++;
                submesh.numOfVertices++;
            }
        });
        submesh.positionBuffer = createFloatBuffer(thisMesh.viewer.gl.ARRAY_BUFFER, positionArray);
        submesh.normalBuffer = createFloatBuffer(thisMesh.viewer.gl.ARRAY_BUFFER, normalArray);
        submesh.tangentBuffer = createFloatBuffer(thisMesh.viewer.gl.ARRAY_BUFFER, tangentArray);
        submesh.uvBuffer = createFloatBuffer(thisMesh.viewer.gl.ARRAY_BUFFER, uvArray);
    });
    
    // Remove transparent submeshes from the main submesh list.
    this.transparentSubmeshes.forEach(function(submesh) {
        removeElement(thisMesh.submeshes, submesh);
    });
}

Mesh.prototype.draw = function() {
    var thisViewer = this.viewer;
    function setMatrices(modelViewer) {
        function setMatrixUniform(matrix, viewerToSet, uniformName) {
            viewerToSet.gl.uniformMatrix4fv(
                viewerToSet.gl.getUniformLocation(viewerToSet.shaderProgram, uniformName),
                false, new Float32Array(matrix.flatten()));
        }
        
        var normalMatrix = modelViewer.mvMatrix.inverse().transpose();
        setMatrixUniform(modelViewer.perspectiveMatrix, modelViewer, "uPMatrix");
        setMatrixUniform(modelViewer.mvMatrix, modelViewer, "uMVMatrix");
        setMatrixUniform(normalMatrix, modelViewer, "uNormalMatrix");
    }
    
    this.viewer.mvMatrixStack.push(this.viewer.mvMatrix.dup());
    transformMatrix(this.viewer.mvMatrix, this.position, this.scale, this.rotation);
    setMatrices(this.viewer);
    
    
    thisViewer.gl.disable(thisViewer.gl.BLEND);
    this.submeshes.forEach(function(submesh) {
        submesh.draw();
    });
    
    //thisViewer.gl.disable(thisViewer.gl.DEPTH_TEST);
    thisViewer.gl.enable(thisViewer.gl.BLEND);
    //thisViewer.gl.blendFunc(thisViewer.gl.SRC_ALPHA, thisViewer.gl.ONE_MINUS_SRC_ALPHA);
    this.transparentSubmeshes.forEach(function(submesh) {
        submesh.draw();
    });
    
    this.viewer.mvMatrix = this.viewer.mvMatrixStack.pop();
}

Submesh.prototype.draw = function() {
    var thisViewer = this.mesh.viewer;
    function setTexture(textureIndex, textureName, texture) {
        thisViewer.gl.activeTexture(thisViewer.gl.TEXTURE0 + textureIndex);
        thisViewer.gl.bindTexture(thisViewer.gl.TEXTURE_2D, texture);
        thisViewer.gl.uniform1i(thisViewer.gl.getUniformLocation(thisViewer.shaderProgram, textureName), textureIndex);
    }
    
    function setShaderAttribute(pointer, buffer, size) {
        thisViewer.gl.bindBuffer(thisViewer.gl.ARRAY_BUFFER, buffer);
        thisViewer.gl.vertexAttribPointer(pointer, size, thisViewer.gl.FLOAT, false, 0, 0);
    }
    
    setShaderAttribute(thisViewer.positionAttribute, this.positionBuffer, 3);
    setShaderAttribute(thisViewer.uvAttribute, this.uvBuffer, 2);
    setShaderAttribute(thisViewer.normalAttribute, this.normalBuffer, 3);
    setShaderAttribute(thisViewer.tangentAttribute, this.tangentBuffer, 3);
    
    setTexture(0, "uDiffuse2D", this.diffuse2D);
    setTexture(1, "uOcclusion2D", this.occlusion2D);
    setTexture(2, "uNormal2D", this.normal2D);
    setTexture(3, "uSpecular2D", this.specular2D);
    setTexture(4, "uGloss2D", this.gloss2D);
    setTexture(5, "uEmission2D", this.emission2D);
    
    thisViewer.gl.uniform4fv(thisViewer.gl.getUniformLocation(thisViewer.shaderProgram, "uDiffuse"), this.diffuse);
    thisViewer.gl.uniform4fv(thisViewer.gl.getUniformLocation(thisViewer.shaderProgram, "uAmbient"), this.ambient);
    thisViewer.gl.uniform4fv(thisViewer.gl.getUniformLocation(thisViewer.shaderProgram, "uSpecular"), this.specular);
    thisViewer.gl.uniform1f(thisViewer.gl.getUniformLocation(thisViewer.shaderProgram, "uGloss"), this.gloss);
    thisViewer.gl.uniform4fv(thisViewer.gl.getUniformLocation(thisViewer.shaderProgram, "uEmission"), this.emission);
    thisViewer.gl.uniform1f(thisViewer.gl.getUniformLocation(thisViewer.shaderProgram, "uNormalMultiplier"), this.normalMultiplier);
    thisViewer.gl.uniform1f(thisViewer.gl.getUniformLocation(thisViewer.shaderProgram, "uDissolve"), this.dissolve);
    
    /*thisViewer.gl.bindBuffer(thisViewer.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    thisViewer.gl.drawElements(thisViewer.gl.TRIANGLES, this.numOfVertices,
            thisViewer.gl.UNSIGNED_INT, 0);*/
    thisViewer.gl.drawArrays(thisViewer.gl.TRIANGLES, 0, this.numOfVertices);
}

Vector.prototype.normalize = function() {
    return this.multiply(1 / Math.sqrt(
            this.elements[0] * this.elements[0] +
            this.elements[1] * this.elements[1] +
            this.elements[2] * this.elements[2]));
}

Matrix.prototype.multVector = function(v, translate) {
    v = v.elements;
    var x = $V([this.elements[0][0], this.elements[1][0], this.elements[2][0]]);
    var y = $V([this.elements[0][1], this.elements[1][1], this.elements[2][1]]);
    var z = $V([this.elements[0][2], this.elements[1][2], this.elements[2][2]]);
    if (translate) {
        var t = $V([this.elements[0][3], this.elements[1][3], this.elements[2][3]]);
        return x.multiply(v[0]).add(y.multiply(v[1])).add(z.multiply(v[2])).add(t.multiply(v[3]));
    } else {
        return x.multiply(v[0]).add(y.multiply(v[1])).add(z.multiply(v[2]));
    }
}

DirectionalLight.prototype.setDirection = function(direction) {
    this.direction = $V(direction);
}

function createSinglePixelTexture(gl, color) {
    var newTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, newTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(color));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return newTexture;
}

function createTexture(gl, image) {
    var newTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, newTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return newTexture;
}

function createImageProcessingTexture(gl, width, height) {
    var newTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, newTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 
            height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    //gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return newTexture;
}

function createCubemap(gl, posX, negX, posY, negY, posZ, negZ) {
    var newCubemap = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, newCubemap);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X,
            0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, posX);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
            0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, negX);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
            0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, posY);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
            0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, negY);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
            0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, posZ);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
            0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, negZ);

    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return newCubemap;
}

function createEmptyCubemap(gl, color) {
    var newCubemap = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, newCubemap);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X,
            0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(color));
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
            0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(color));
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
            0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(color));
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
            0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(color));
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
            0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(color));
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
            0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(color));

    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return newCubemap;
}

function transformMatrix(matrix, position, scale, rotation) {
    translateMatrix(matrix, position);
    scaleMatrix(matrix, scale);

    // Rotate matrix by Euler angles in order Z -> X -> Y
    // Z axis
    rotateMatrix(matrix, rotation[2], [0, 0, 1]);
    
    // X axis
    rotateMatrix(matrix, rotation[0], [1, 0, 0]);
    
    // Y axis
    rotateMatrix(matrix, rotation[1], [0, 1, 0]);
}

function scaleMatrix(matrix, scalingVector) {
    scalingVector = scalingVector.elements;
    // x axis.
    matrix.elements[0][0] *= scalingVector[0];
    matrix.elements[1][0] *= scalingVector[0];
    matrix.elements[2][0] *= scalingVector[0];
    
    // y axis.
    matrix.elements[0][1] *= scalingVector[1];
    matrix.elements[1][1] *= scalingVector[1];
    matrix.elements[2][1] *= scalingVector[1];
    
    // z axis.
    matrix.elements[0][2] *= scalingVector[2];
    matrix.elements[1][2] *= scalingVector[2];
    matrix.elements[2][2] *= scalingVector[2];
}

function translateMatrix(matrix, v) {
    multiplyMatrix(matrix, Matrix.Translation(v).ensure4x4());
}

function rotateMatrix(matrix, angle, v) {
  var inRadians = angle * Math.PI / 180.0;
  var m = Matrix.Rotation(inRadians, $V([v[0], v[1], v[2]])).ensure4x4();
  multiplyMatrix(matrix, m);
}

// Multiply m1 by m2 and write to m1.
function multiplyMatrix(m1, m2) {
    copyMatrixValues(m1, m1.x(m2));
}

// Copy values from m2 to m1.
// This function doesn't check for size difference.
function copyMatrixValues(m1, m2) {
    for (var i = 0; i < m1.elements.length; i++) {
        for (var j = 0; j < m1.elements[0].length; j++) {
            m1.elements[i][j] = m2.elements[i][j];
        }
    }
}

function lerpF(a, b, t) {
    return (1 - t) * a + t * b;
}

function lerpV(a, b, t) {
    return a.multiply(1 - t).add(b.multiply(t));
}

// Returns a to make it easy to chain the functions.
function addVectorBtoA(a, b) {
    if (a.length != b.length) return;
    for (var i = 0; i < a.length; i++) {
        a[i] += b[i];
    }
    return a;
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

// ASYNCHRONOUSLY create an image that is the size of the highest power of 2 below.
function makePowerOf2Image(image, callback) {
    // Already a power of 2.
    if (image.width == image.height && (image.width & (image.width - 1)) == 0) {
        callback(image);
        return;
    }
    
    // Else
    var size = Math.min(image.width, image.height);
    size = 1 << Math.floor(Math.log2(size)); // Highest power of 2 below.
    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = tempCanvas.height = size;
    var context = tempCanvas.getContext('2d');
    context.drawImage(image, 0, 0, size, size);
    var newImage = new Image();
    newImage.src = tempCanvas.toDataURL();
    newImage.onload = function() {callback(this);};
}

function getShader(gl, shaderCode, type, name) {
    if (gl != null && shaderCode != null) {
        var shader;
        if (type == "VERTEX") {
            shader = gl.createShader(gl.VERTEX_SHADER);
        } else if (type == "FRAGMENT") {
            shader = gl.createShader(gl.FRAGMENT_SHADER);
        } else {
            alert("Unknown shader type: " + type);
            return null;
        }
        
        gl.shaderSource(shader, shaderCode);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            alert("Error compile shader " + name + ". " + gl.getShaderInfoLog(shader));
            return null;
        }
        return shader;
    }
}

function ajaxGet(url, callback, async) {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function () {
        if (this.readyState == 4 && this.status == 200) {
            callback(this.responseText);
        }
    };
    xhttp.open("GET", url, async);
    xhttp.send();
}