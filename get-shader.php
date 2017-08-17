<?php
    $shaders = simplexml_load_file("shaders.xml");
    $type = $_GET['type'];
    if ($type == 'VERTEX') {
        echo $shaders->vertex[0];
    } else if ($type == 'FRAGMENT') {
        echo $shaders->fragment[0];
    }
?>