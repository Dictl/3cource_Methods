# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models


class ClassifierNode(models.Model):
    parent = models.ForeignKey('self', models.DO_NOTHING, blank=True, null=True)
    name = models.TextField(unique=True)
    unit = models.TextField(blank=True, null=True)
    sort_order = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'classifier_node'


class EnumDefinition(models.Model):
    classifier_node = models.OneToOneField(ClassifierNode, models.DO_NOTHING)
    description = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'enum_definition'


class EnumValue(models.Model):
    enum_definition = models.ForeignKey(EnumDefinition, models.DO_NOTHING)
    value_str = models.TextField(blank=True, null=True)
    value_int = models.IntegerField(blank=True, null=True)
    value_real = models.FloatField(blank=True, null=True)
    sort_order = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'enum_value'


class ParameterDefinition(models.Model):
    classifier_node = models.ForeignKey(ClassifierNode, models.DO_NOTHING)
    name = models.CharField(max_length=128)
    unit = models.ForeignKey('Unit', models.DO_NOTHING, blank=True, null=True)
    value_type = models.CharField(max_length=8)
    sort_order = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'parameter_definition'
        unique_together = (('classifier_node', 'name'),)


class ParameterNumericConstraint(models.Model):
    parameter_definition = models.OneToOneField(ParameterDefinition, models.DO_NOTHING, primary_key=True)
    min_value = models.DecimalField(max_digits=20, decimal_places=6)
    max_value = models.DecimalField(max_digits=20, decimal_places=6)

    class Meta:
        managed = False
        db_table = 'parameter_numeric_constraint'


class Product(models.Model):
    classifier_node = models.ForeignKey(ClassifierNode, models.DO_NOTHING)
    sku = models.CharField(unique=True, max_length=100, blank=True, null=True)
    name = models.TextField()
    created_at = models.DateTimeField(blank=True, null=True)
    price = models.IntegerField()
    supplier = models.TextField()
    weight_gram = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'product'


class ProductAttributeValue(models.Model):
    product = models.ForeignKey(Product, models.DO_NOTHING)
    enum_value = models.ForeignKey(EnumValue, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'product_attribute_value'


class ProductParameterValue(models.Model):
    product = models.ForeignKey(Product, models.DO_NOTHING)
    parameter_definition = models.ForeignKey(ParameterDefinition, models.DO_NOTHING)
    value_str = models.TextField(blank=True, null=True)
    value_int = models.IntegerField(blank=True, null=True)
    value_real = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    value_enum = models.ForeignKey(EnumValue, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'product_parameter_value'
        unique_together = (('product', 'parameter_definition'),)


class Unit(models.Model):
    dimension = models.ForeignKey('UnitDimension', models.DO_NOTHING)
    name = models.CharField(max_length=64)
    symbol = models.CharField(unique=True, max_length=16)
    to_base_factor = models.DecimalField(max_digits=20, decimal_places=8)
    to_base_offset = models.DecimalField(max_digits=20, decimal_places=8)

    class Meta:
        managed = False
        db_table = 'unit'


class UnitDimension(models.Model):
    name = models.CharField(unique=True, max_length=64)

    class Meta:
        managed = False
        db_table = 'unit_dimension'
