var VERTEX_SHADER;
var FRAGMENT_SHADER;
var shaderCount = 0;

ajaxGet("get-shader.php?type=VERTEX", function(response) {VERTEX_SHADER = response;}, false);
ajaxGet("get-shader.php?type=FRAGMENT", function(response) {FRAGMENT_SHADER = response;}, false);
//console.log(!VERTEX_SHADER || !FRAGMENT_SHADER);

function Viewer(canvas) {
    getGLContext(this, canvas);
    this.meshes = [];
    this.distance = 1;
    this.pitch = 30;
    this.yaw = 0;
    this.offset = [0, 0, 0];
    this.mvMatrix = Matrix.I(4);
    this.ambient = [.2, .2, .2];
    this.lightDirection = [0, -1, -1];
    this.lightColor = [1, 1, 1];
    this.shaderProgram = this.gl.createProgram();
    this.vertexShader = getShader(this.gl, VERTEX_SHADER, "VERTEX");
    this.fragmentShader = getShader(this.gl, FRAGMENT_SHADER, "FRAGMENT");
    this.gl.attachShader(this.shaderProgram, this.vertexShader);
    this.gl.attachShader(this.shaderProgram, this.fragmentShader);
    this.gl.linkProgram(this.shaderProgram);

    if (!this.gl.getProgramParameter(this.shaderProgram, this.gl.LINK_STATUS)) {
        alert("Can't link shader program to gl context. " + this.gl.getProgramInfoLog(this.shaderProgram));
    }
    this.gl.useProgram(this.shaderProgram);
    
    this.positionAttribute = this.gl.getAttribLocation(this.shaderProgram, "aPosition");
    this.normalAttribute = this.gl.getAttribLocation(this.shaderProgram, "aNormal");
    this.tangentAttribute = this.gl.getAttribLocation(this.shaderProgram, "aTangent");
    this.uvAttribute = this.gl.getAttribLocation(this.shaderProgram, "aUV");

    this.mvMatrixStack = [];
    this.setPerspectiveMatrix(canvas.offsetWidth, canvas.offsetHeight, 70, .1, 100);
    
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
    this.gl.clearDepth(1.0);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);
}

Viewer.prototype.setPerspectiveMatrix = function(width, height, fov, zNear, zFar) {
    this.perspectiveMatrix = makePerspective(fov, width / height, zNear, zFar);
}

Viewer.prototype.drawScene = function() {
    
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.mvMatrix = Matrix.I(4);
    translateMatrix(this.mvMatrix, [0, 0, -this.distance]);
    rotateMatrix(this.mvMatrix, this.yaw, [0, 1, 0]);
    rotateMatrix(this.mvMatrix, -this.pitch, [1, 0, 0]);
    translateMatrix(this.mvMatrix, [-this.offset[0], -this.offset[1], -this.offset[2]]);
    this.gl.uniform3fv(this.gl.getUniformLocation(this.shaderProgram, "uAmbient"), this.ambient);
    this.gl.uniform3fv(this.gl.getUniformLocation(this.shaderProgram, "uLightDirection"), this.lightDirection);
    this.gl.uniform3fv(this.gl.getUniformLocation(this.shaderProgram, "uLightColor"), this.lightColor);
    this.meshes.forEach(function(mesh) {
        mesh.draw(this);
    });
}

// Mesh stores vertex locations, uv, normals, tangents, bitangents, transformation.
// It also stores the unprocessed geometry that will be processed into submeshes.
function Mesh(viewer) {
    this.viewer = viewer;
    this.submeshes = [];
    this.position = [0, 0, 0];
    this.rotation = [0, 0, 0];
    this.scale = [1, 1, 1];
}

function Submesh(mesh) {
    this.diffuse = [1, 1, 1];
    this.ambient = [1, 1, 1];
    this.specular = [.3, .3, .3];
    this.specularComponent = 60;
}

Mesh.prototype.processGeometry = function() {
}

Mesh.prototype.draw = function() {
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
    
    this.submeshes.forEach(function(submesh) {
        submesh.draw(this.viewer, this);
    });
    
    this.viewer.mvMatrix = this.viewer.mvMatrixStack.pop();
}

Submesh.prototype.draw = function(viewer, mesh) {
    function setTexture(textureIndex, textureName, texture) {
        viewer.gl.activeTexture(viewer.gl.TEXTURE0 + textureIndex);
        viewer.gl.bindTexture(viewer.gl.TEXTURE_2D, texture);
        viewer.gl.uniform1i(viewer.gl.getUniformLocation(viewer.shaderProgram, textureName), textureIndex);
    }
    
    viewer.gl.bindBuffer(viewer.gl.ARRAY_BUFFER, mesh.positionBuffer);
    viewer.gl.vertexAttribPointer(viewer.positionAttribute, 3, viewer.gl.FLOAT, false, 0, 0);
    
    viewer.gl.bindBuffer(viewer.gl.ARRAY_BUFFER, mesh.uvBuffer);
    viewer.gl.vertexAttribPointer(viewer.uvAttribute, 2, viewer.gl.FLOAT, false, 0, 0);
    
    viewer.gl.bindBuffer(viewer.gl.ARRAY_BUFFER, mesh.tangentBuffer);
    viewer.gl.vertexAttribPointer(viewer.tangentAttribute, 3, viewer.gl.FLOAT, false, 0, 0);
    
    viewer.gl.bindBuffer(viewer.gl.ARRAY_BUFFER, mesh.normalBuffer);
    viewer.gl.vertexAttribPointer(viewer.normalAttribute, 3, viewer.gl.FLOAT, false, 0, 0);
    
    setTexture(0, "uDiffuse2D", this.diffuse2D);
    setTexture(1, "uOcclusion2D", this.occlusion2D);
    setTexture(2, "uNormal2D", this.normal2D);
    setTexture(3, "uSpecular2D", this.specular2D);
    setTexture(4, "uSpecularComponent2D", this.specularComponent2D);
    
    viewer.gl.uniform3fv(viewer.gl.getUniformLocation(viewer.shaderProgram, "diffuse"), this.diffuse);
    viewer.gl.uniform3fv(viewer.gl.getUniformLocation(viewer.shaderProgram, "ambient"), this.ambient);
    viewer.gl.uniform3fv(viewer.gl.getUniformLocation(viewer.shaderProgram, "specular"), this.specular);
    viewer.gl.uniform3fv(viewer.gl.getUniformLocation(viewer.shaderProgram, "specularComponent"), this.specularComponent);
    
    viewer.gl.bindBuffer(viewer.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    viewer.gl.drawElements(viewer.gl.TRIANGLES, this.indexBuffer.length / 3,
            viewer.gl.UNSIGNED_SHORT, 0);
}

// Submesh keeps a reference of what mesh it belongs to.
// Each submesh has all the geometry of a material.
function Submesh(mesh) {
    this.mesh = mesh;
}

function getGLContext(viewer, canvas) {
    viewer.gl = null;
    try {
        viewer.gl = canvas.getContext("experimental-webgl");
    } catch(e) {
    }
}

function transformMatrix(matrix, position, scale, rotation) {
    translateMatrix(matrix, position);
    scaleMatrix(matrix, scale);
    
    // Rotate matrix by Euler angles in order Z -> X -> Y
    // Z axis
    rotateMatrix(matrix, [0, 0, 1], rotation[2]);
    
    // X axis
    rotateMatrix(matrix, [1, 0, 0], rotation[0]);
    
    // Y axis
    rotateMatrix(matrix, [0, 1, 0], rotation[1]);
}

function scaleMatrix(matrix, scalingVector) {
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
    multiplyMatrix(matrix, Matrix.Translation($V([v[0], v[1], v[2]])).ensure4x4());
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

function getShader(gl, shaderCode, type) {
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
            alert("Error compile shader. " + gl.getShaderInfoLog(shader));
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